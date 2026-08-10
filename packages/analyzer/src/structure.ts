import type { GrammarFeatures, GrammarIR } from "@gramin/core";
import { alternativeEdgeReference, isAlternativeNullable } from "./expressions.js";
import {
  buildDependencyGraph,
  maxCondensedDepth,
  rankFan,
  reachableRules,
  stronglyConnectedComponents,
} from "./graph.js";
import { compareBytes, round4 } from "./numbers.js";

const computeNullableRules = (ir: GrammarIR): Set<string> => {
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
  const productiveExternalSymbols = new Set(ir.externalSymbols.map((symbol) => symbol.name));
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
}

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
  const nullable = ir.capabilities.orderedChoice ? undefined : computeNullableRules(ir);
  const productive = computeProductiveRules(ir);
  const notApplicable: Record<string, string> = {};
  if (nullable === undefined) {
    notApplicable.nullableRules =
      "orderedChoice grammar: CFG nullability does not apply; see PEG interpretation";
  }
  if (reachable.size === 0) {
    const reason = "grammar has no rule reachable from a start symbol";
    notApplicable["recursiveRules.ratio"] = reason;
    notApplicable["largestRecursiveComponent.ratio"] = reason;
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
      ...(nullable === undefined ? {} : { nullableRules: nullable.size }),
      ...(Object.keys(notApplicable).length === 0 ? {} : { notApplicable }),
    },
    largestRecursiveMembers: largestRecursive,
    coreSymbols: fan.in.filter((entry) => entry.count > 0).map((entry) => entry.symbol),
  };
};
