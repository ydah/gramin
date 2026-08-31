import type { GrammarFeatures, GrammarIR } from "@gramin/core";
import {
  alternativeEdgeReference,
  isAlternativeNullable,
  maxExpressionNestingDepth,
} from "./expressions.js";
import {
  buildDependencyGraph,
  type DependencyGraph,
  graphCriticalPoints,
  maxCondensedDepth,
  rankBetweenness,
  rankFan,
  reachableRules,
  stronglyConnectedComponents,
} from "./graph.js";
import { compareBytes, round4 } from "./numbers.js";

export const computeNullableRules = (ir: GrammarIR): Set<string> => {
  const nullable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of ir.rules) {
      if (nullable.has(rule.name)) continue;
      if (!rule.alternatives.some((alternative) => isAlternativeNullable(alternative, nullable))) {
        continue;
      }
      nullable.add(rule.name);
      changed = true;
    }
  }
  return nullable;
};

const isExpressionProductive = (
  expression: GrammarIR["rules"][number]["alternatives"][number]["items"][number],
  productiveRules: ReadonlySet<string>,
  productiveExternalSymbols: ReadonlySet<string>,
): boolean => {
  if (expression.kind === "symbol") {
    return productiveRules.has(expression.name) || productiveExternalSymbols.has(expression.name);
  }
  if (
    expression.kind === "terminal" ||
    expression.kind === "charClass" ||
    expression.kind === "anyChar" ||
    expression.kind === "midRuleAction"
  ) {
    return true;
  }
  if (expression.kind === "opt" || expression.kind === "star") return true;
  if (
    expression.kind === "plus" ||
    expression.kind === "predicate" ||
    expression.kind === "group"
  ) {
    return isExpressionProductive(expression.expr, productiveRules, productiveExternalSymbols);
  }
  if (expression.kind === "seq") {
    return expression.items.every((item) =>
      isExpressionProductive(item, productiveRules, productiveExternalSymbols),
    );
  }
  return expression.alts.some((alternative) =>
    isExpressionProductive(alternative, productiveRules, productiveExternalSymbols),
  );
};

const computeProductiveRules = (ir: GrammarIR): Set<string> => {
  const productive = new Set<string>();
  const productiveExternalSymbols = new Set(
    ir.externalSymbols
      .filter((symbol) => symbol.kind === "rule" && symbol.origin !== "unresolved")
      .map((symbol) => symbol.name),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of ir.rules) {
      if (productive.has(rule.name)) continue;
      const isProductive = rule.alternatives.some((alternative) =>
        alternative.items.every((item) =>
          isExpressionProductive(item, productive, productiveExternalSymbols),
        ),
      );
      if (!isProductive) continue;
      productive.add(rule.name);
      changed = true;
    }
  }
  return productive;
};

export interface StructureResult {
  readonly features: GrammarFeatures["structure"];
  readonly largestRecursiveMembers: readonly string[];
  readonly coreSymbols: readonly string[];
  readonly shortestDerivations: ReadonlyMap<string, number>;
  readonly graph: DependencyGraph;
}

const expressionDerivationLength = (
  expression: GrammarIR["rules"][number]["alternatives"][number]["items"][number],
  lengths: ReadonlyMap<string, number>,
  externalTerminals: ReadonlySet<string>,
): number => {
  if (
    expression.kind === "terminal" ||
    expression.kind === "charClass" ||
    expression.kind === "anyChar"
  ) {
    return 1;
  }
  if (expression.kind === "symbol") {
    return lengths.get(expression.name) ?? (externalTerminals.has(expression.name) ? 1 : Infinity);
  }
  if (
    expression.kind === "midRuleAction" ||
    expression.kind === "opt" ||
    expression.kind === "star" ||
    expression.kind === "predicate"
  ) {
    return 0;
  }
  if (expression.kind === "plus" || expression.kind === "group") {
    return expressionDerivationLength(expression.expr, lengths, externalTerminals);
  }
  if (expression.kind === "seq") {
    return expression.items.reduce(
      (total, item) => total + expressionDerivationLength(item, lengths, externalTerminals),
      0,
    );
  }
  return Math.min(
    ...expression.alts.map((alternative) =>
      expressionDerivationLength(alternative, lengths, externalTerminals),
    ),
  );
};

const shortestDerivations = (ir: GrammarIR): Map<string, number> => {
  const lengths = new Map(ir.rules.map((rule) => [rule.name, Infinity]));
  const externalTerminals = new Set(
    ir.externalSymbols.filter((symbol) => symbol.kind === "terminal").map((symbol) => symbol.name),
  );
  let changed = true;
  while (changed) {
    changed = false;
    ir.rules.forEach((rule) => {
      const length = Math.min(
        ...rule.alternatives.map((alternative) =>
          alternative.items.reduce(
            (total, item) => total + expressionDerivationLength(item, lengths, externalTerminals),
            0,
          ),
        ),
      );
      if (length >= (lengths.get(rule.name) ?? Infinity)) return;
      lengths.set(rule.name, length);
      changed = true;
    });
  }
  return lengths;
};

const fanInShape = (graph: ReturnType<typeof buildDependencyGraph>): [number, number] => {
  const counts = new Map([...graph.keys()].map((name) => [name, 0]));
  graph.forEach((targets) => {
    targets.forEach((target) => {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    });
  });
  const values = [...counts.values()].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0 || values.length === 0) return [0, 0];
  const weighted = values.reduce(
    (sum, value, index) => sum + (2 * (index + 1) - values.length - 1) * value,
    0,
  );
  const entropy = values.reduce((sum, value) => {
    if (value === 0) return sum;
    const probability = value / total;
    return sum - probability * Math.log2(probability);
  }, 0);
  return [round4(weighted / (values.length * total)), round4(entropy)];
};

export const structureFeatures = (ir: GrammarIR): StructureResult => {
  const graph = buildDependencyGraph(ir);
  const components = stronglyConnectedComponents(graph);
  const recursiveComponents = components.filter((component) => component.length >= 2);
  const largestRecursive =
    [...recursiveComponents].sort(
      (left, right) =>
        right.length - left.length || compareBytes(left.join("\0"), right.join("\0")),
    )[0] ?? [];
  const reachable = reachableRules(graph, ir.startSymbols);
  const reachableRecursiveComponents = components.filter((component) => {
    if (!component.some((member) => reachable.has(member))) return false;
    if (component.length >= 2) return true;
    const member = component[0];
    return member !== undefined && graph.get(member)?.has(member) === true;
  });
  const largestReachableRecursive =
    [...reachableRecursiveComponents].sort(
      (left, right) =>
        right.length - left.length || compareBytes(left.join("\0"), right.join("\0")),
    )[0] ?? [];
  const recursiveRuleCount = reachableRecursiveComponents.reduce(
    (count, component) => count + component.length,
    0,
  );
  const fan = rankFan(graph);
  const critical = graphCriticalPoints(graph);
  const derivations = shortestDerivations(ir);
  const [fanInGini, fanInEntropy] = fanInShape(graph);
  const startReachable = [...new Set(ir.startSymbols)].sort(compareBytes).map((symbol) => ({
    symbol,
    rules: reachableRules(graph, [symbol]),
  }));
  const startUnion = new Set(startReachable.flatMap(({ rules }) => [...rules]));
  const startIntersection = new Set(startReachable[0]?.rules ?? []);
  startReachable.slice(1).forEach(({ rules }) => {
    startIntersection.forEach((rule) => {
      if (!rules.has(rule)) startIntersection.delete(rule);
    });
  });
  const directLeftRecursiveRules = ir.rules.filter((rule) =>
    rule.alternatives.some(
      (alternative) => alternativeEdgeReference(alternative, "first") === rule.name,
    ),
  ).length;
  const directRightRecursiveRules = ir.rules.filter((rule) =>
    rule.alternatives.some(
      (alternative) => alternativeEdgeReference(alternative, "last") === rule.name,
    ),
  ).length;
  const nullable =
    ir.capabilities.orderedChoice || ir.capabilities.parameterizedRules
      ? undefined
      : computeNullableRules(ir);
  const productive = computeProductiveRules(ir);
  const notApplicable: Record<string, string> = {};
  if (nullable === undefined) {
    notApplicable.nullableRules = ir.capabilities.orderedChoice
      ? "orderedChoice grammar: CFG nullability does not apply; see PEG interpretation"
      : "parameterizedRules grammar: expand parameters before CFG nullability analysis";
  }
  if (reachable.size === 0) {
    const reason = "grammar has no rule reachable from a start symbol";
    notApplicable["recursiveRules.ratio"] = reason;
    notApplicable["largestRecursiveComponent.ratio"] = reason;
  }
  if (startReachable.length === 0) {
    notApplicable["startSymbolReachability.overlapRatio"] = "grammar has no start symbols";
  }

  return {
    features: {
      directLeftRecursiveRules,
      directRightRecursiveRules,
      recursionSccCount: recursiveComponents.length,
      largestSccSize: {
        value: largestRecursive.length,
        members: [...largestRecursive],
      },
      maxDependencyDepth: maxCondensedDepth(graph, components, reachable),
      topFanIn: fan.in,
      topFanOut: fan.out,
      unreachableSymbols: [...graph.keys()]
        .filter((name) => !reachable.has(name))
        .sort(compareBytes),
      unproductiveSymbols: [...graph.keys()]
        .filter((name) => !productive.has(name))
        .sort(compareBytes),
      reachableRules: reachable.size,
      recursiveRules: {
        count: recursiveRuleCount,
        ...(reachable.size === 0 ? {} : { ratio: round4(recursiveRuleCount / reachable.size) }),
      },
      largestRecursiveComponent: {
        value: largestReachableRecursive.length,
        members: [...largestReachableRecursive],
        ...(reachable.size === 0
          ? {}
          : { ratio: round4(largestReachableRecursive.length / reachable.size) }),
      },
      articulationPoints: critical.articulationPoints,
      bridges: critical.bridges,
      topBetweenness: rankBetweenness(graph).map((entry) => ({
        ...entry,
        value: round4(entry.value),
      })),
      fanInGini,
      fanInEntropy,
      shortestDerivation: [...derivations]
        .filter(([, length]) => Number.isFinite(length))
        .map(([rule, length]) => ({ rule, length }))
        .sort((left, right) => compareBytes(left.rule, right.rule)),
      shortestDerivationUnknown: [...derivations]
        .filter(([, length]) => !Number.isFinite(length))
        .map(([rule]) => rule)
        .sort(compareBytes),
      startSymbolReachability: {
        entries: startReachable.map(({ symbol, rules }) => ({
          symbol,
          reachableRules: rules.size,
          rules: [...rules].sort(compareBytes),
        })),
        ...(startReachable.length === 0
          ? {}
          : {
              overlapRatio: round4(
                startUnion.size === 0 ? 0 : startIntersection.size / startUnion.size,
              ),
            }),
      },
      maxExpressionNestingDepth: maxExpressionNestingDepth(
        ir.rules.flatMap((rule) => rule.alternatives.flatMap((alternative) => alternative.items)),
      ),
      ...(nullable === undefined ? {} : { nullableRules: nullable.size }),
      ...(Object.keys(notApplicable).length === 0 ? {} : { notApplicable }),
    },
    largestRecursiveMembers: largestRecursive,
    coreSymbols: fan.in.filter((entry) => entry.count > 0).map((entry) => entry.symbol),
    shortestDerivations: derivations,
    graph,
  };
};
