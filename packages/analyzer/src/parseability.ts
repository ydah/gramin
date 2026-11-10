import {
  type Alternative,
  type Expr,
  type GrammarFeatures,
  type GrammarIR,
  mergeRulesByName,
} from "@gramin/core";
import { isExpressionNullable, walkExpression } from "./expressions.js";
import { stronglyConnectedComponents } from "./graph.js";
import { compareBytes, nearestRankPercentile, round4 } from "./numbers.js";
import { expandParameterizedRules, PARAMETER_EXPANSION_LIMITS } from "./parameter-expansion.js";
import { computeNullableRules } from "./structure.js";
import { type TokenSet, TokenUniverse } from "./token-set.js";

const terminalKey = (expression: Extract<Expr, { kind: "terminal" }>): string =>
  expression.name === undefined ? `literal:${expression.literal}` : `name:${expression.name}`;

const tokenUniverse = (ir: GrammarIR, ruleNames: ReadonlySet<string>): TokenUniverse => {
  const keys = new Set(["end-of-input"]);
  for (const rule of ir.rules) {
    for (const alternative of rule.alternatives) {
      for (const item of alternative.items) {
        walkExpression(item, (expression) => {
          if (expression.kind === "terminal" && expression.literal !== "") {
            keys.add(terminalKey(expression));
          } else if (expression.kind === "charClass") keys.add(`class:${expression.pattern}`);
          else if (expression.kind === "anyChar") keys.add("any-char");
          else if (expression.kind === "symbol" && !ruleNames.has(expression.name)) {
            keys.add(`symbol:${expression.name}`);
          }
        });
      }
    }
  }
  return new TokenUniverse(keys);
};

const firstExpression = (
  expression: Expr,
  firstRules: ReadonlyMap<string, TokenSet>,
  nullable: ReadonlySet<string>,
  tokens: TokenUniverse,
): TokenSet => {
  if (expression.kind === "terminal") {
    return tokens.set(expression.literal === "" ? [] : [terminalKey(expression)]);
  }
  if (expression.kind === "charClass") return tokens.set([`class:${expression.pattern}`]);
  if (expression.kind === "anyChar") return tokens.set(["any-char"]);
  if (expression.kind === "symbol") {
    return firstRules.get(expression.name)?.clone() ?? tokens.set([`symbol:${expression.name}`]);
  }
  if (expression.kind === "midRuleAction" || expression.kind === "predicate") return tokens.set();
  if (expression.kind === "choice") {
    const result = tokens.set();
    expression.alts.forEach((alternative) => {
      result.addAll(firstExpression(alternative, firstRules, nullable, tokens));
    });
    return result;
  }
  if (expression.kind === "seq") {
    const result = tokens.set();
    for (const item of expression.items) {
      result.addAll(firstExpression(item, firstRules, nullable, tokens));
      if (!isExpressionNullable(item, nullable)) break;
    }
    return result;
  }
  return firstExpression(expression.expr, firstRules, nullable, tokens);
};

const firstAlternative = (
  alternative: Alternative,
  firstRules: ReadonlyMap<string, TokenSet>,
  nullable: ReadonlySet<string>,
  tokens: TokenUniverse,
): TokenSet =>
  firstExpression({ kind: "seq", items: alternative.items }, firstRules, nullable, tokens);

const computeFirstSets = (
  ir: GrammarIR,
  nullable: ReadonlySet<string>,
  tokens: TokenUniverse,
): Map<string, TokenSet> => {
  const rules = mergeRulesByName(ir.rules);
  const first = new Map(rules.map((rule) => [rule.name, tokens.set()]));
  let changed = true;
  while (changed) {
    changed = false;
    rules.forEach((rule) => {
      const target = first.get(rule.name);
      if (!target) return;
      rule.alternatives.forEach((alternative) => {
        if (target.addAll(firstAlternative(alternative, first, nullable, tokens))) changed = true;
      });
    });
  }
  return first;
};

const propagateFollow = (
  expression: Expr,
  trailer: TokenSet,
  first: ReadonlyMap<string, TokenSet>,
  follow: ReadonlyMap<string, TokenSet>,
  nullable: ReadonlySet<string>,
  tokens: TokenUniverse,
): boolean => {
  if (expression.kind === "symbol") {
    const target = follow.get(expression.name);
    return target ? target.addAll(trailer) : false;
  }
  if (expression.kind === "seq") {
    let changed = false;
    let next = trailer.clone();
    for (let index = expression.items.length - 1; index >= 0; index -= 1) {
      const item = expression.items[index];
      if (!item) continue;
      if (propagateFollow(item, next, first, follow, nullable, tokens)) changed = true;
      const itemFirst = firstExpression(item, first, nullable, tokens);
      if (isExpressionNullable(item, nullable)) itemFirst.addAll(next);
      next = itemFirst;
    }
    return changed;
  }
  if (expression.kind === "choice") {
    return expression.alts.reduce(
      (changed, alternative) =>
        propagateFollow(alternative, trailer, first, follow, nullable, tokens) || changed,
      false,
    );
  }
  if (expression.kind === "star" || expression.kind === "plus") {
    const repeated = trailer.clone();
    repeated.addAll(firstExpression(expression.expr, first, nullable, tokens));
    return propagateFollow(expression.expr, repeated, first, follow, nullable, tokens);
  }
  if (expression.kind === "opt" || expression.kind === "group") {
    return propagateFollow(expression.expr, trailer, first, follow, nullable, tokens);
  }
  return false;
};

const computeFollowSets = (
  ir: GrammarIR,
  first: ReadonlyMap<string, TokenSet>,
  nullable: ReadonlySet<string>,
  tokens: TokenUniverse,
): Map<string, TokenSet> => {
  const rules = mergeRulesByName(ir.rules);
  const follow = new Map(rules.map((rule) => [rule.name, tokens.set()]));
  ir.startSymbols.forEach((symbol) => {
    follow.get(symbol)?.add("end-of-input");
  });
  let changed = true;
  while (changed) {
    changed = false;
    rules.forEach((rule) => {
      const trailer = follow.get(rule.name) ?? tokens.set();
      rule.alternatives.forEach((alternative) => {
        if (
          propagateFollow(
            { kind: "seq", items: alternative.items },
            trailer,
            first,
            follow,
            nullable,
            tokens,
          )
        ) {
          changed = true;
        }
      });
    });
  }
  return follow;
};

const distribution = (
  values: ReadonlyMap<string, TokenSet>,
): NonNullable<GrammarFeatures["parseability"]["firstSetSize"]> | undefined => {
  if (values.size === 0) return undefined;
  const entries = [...values].map(([rule, set]) => ({ rule, value: set.size }));
  const maximum = entries.sort(
    (left, right) => right.value - left.value || compareBytes(left.rule, right.rule),
  )[0];
  if (!maximum) return undefined;
  const sizes = entries.map(({ value }) => value);
  const p50 = nearestRankPercentile(sizes, 0.5);
  const p95 = nearestRankPercentile(sizes, 0.95);
  return {
    average: round4(sizes.reduce((sum, value) => sum + value, 0) / sizes.length),
    maximum,
    ...(p50 === undefined || p95 === undefined ? {} : { percentiles: { p50, p95 } }),
  };
};

const unitTarget = (
  alternative: Alternative,
  ruleNames: ReadonlySet<string>,
  parameters: ReadonlySet<string>,
): string | undefined => {
  const items = alternative.items.filter((item) => item.kind !== "midRuleAction");
  let item: Expr | undefined = items[0];
  while (item?.kind === "group") item = item.expr;
  return items.length === 1 &&
    item?.kind === "symbol" &&
    !parameters.has(item.name) &&
    item.args === undefined &&
    ruleNames.has(item.name)
    ? item.name
    : undefined;
};

interface ParseabilityOptions {
  readonly lr?: boolean;
}

export interface RuleParseabilityMetrics {
  readonly firstSetSize?: number;
  readonly followSetSize?: number;
  readonly slrConflictInvolvement?: number;
  readonly ll1Conflicts?: {
    readonly firstFirst: number;
    readonly firstFollow: number;
    readonly total: number;
  };
  readonly unitRules: number;
}

export interface ParseabilityAnalysis {
  readonly features: GrammarFeatures["parseability"];
  readonly perRule: ReadonlyMap<string, RuleParseabilityMetrics>;
}

interface Production {
  readonly lhs: string;
  readonly rhs: readonly string[];
  readonly augmented: boolean;
}

const productionItems = (
  expression: Expr,
  ruleNames: ReadonlySet<string>,
): string[] | undefined => {
  if (expression.kind === "symbol") {
    if (expression.args !== undefined) return undefined;
    return [
      ruleNames.has(expression.name) ? `N:${expression.name}` : `T:symbol:${expression.name}`,
    ];
  }
  if (expression.kind === "terminal") {
    return expression.literal === "" ? [] : [`T:${terminalKey(expression)}`];
  }
  if (expression.kind === "charClass") return [`T:class:${expression.pattern}`];
  if (expression.kind === "anyChar") return ["T:any-char"];
  if (expression.kind === "midRuleAction") return [];
  if (expression.kind === "group" || expression.kind === "seq") {
    const items = expression.kind === "group" ? [expression.expr] : expression.items;
    const flattened: string[] = [];
    for (const item of items) {
      const result = productionItems(item, ruleNames);
      if (!result) return undefined;
      flattened.push(...result);
    }
    return flattened;
  }
  return undefined;
};

const slrFeatures = (
  ir: GrammarIR,
  follow: ReadonlyMap<string, TokenSet>,
):
  | {
      readonly features: NonNullable<GrammarFeatures["parseability"]["slr"]>;
      readonly perRule: ReadonlyMap<string, number>;
    }
  | undefined => {
  const rules = mergeRulesByName(ir.rules);
  if (rules.some((rule) => rule.params !== undefined)) return undefined;
  const ruleNames = new Set(rules.map((rule) => rule.name));
  const productions: Production[] = ir.startSymbols
    .filter((symbol) => ruleNames.has(symbol))
    .map((symbol) => ({ lhs: "@start", rhs: [`N:${symbol}`], augmented: true }));
  const startProductionCount = productions.length;
  for (const rule of rules) {
    for (const alternative of rule.alternatives) {
      const rhs = productionItems({ kind: "seq", items: alternative.items }, ruleNames);
      if (!rhs) return undefined;
      productions.push({ lhs: rule.name, rhs, augmented: false });
    }
  }
  const byLhs = new Map<string, number[]>();
  productions.forEach((production, index) => {
    const entries = byLhs.get(production.lhs) ?? [];
    entries.push(index);
    byLhs.set(production.lhs, entries);
  });
  const itemKey = (production: number, dot: number): string => `${production}:${dot}`;
  const parseItem = (item: string): [number, number] => {
    const [production, dot] = item.split(":").map(Number);
    return [production ?? 0, dot ?? 0];
  };
  const closure = (seed: Iterable<string>): string[] => {
    const items = new Set(seed);
    const pending = [...items];
    const expanded = new Set<string>();
    while (pending.length > 0) {
      const item = pending.pop();
      if (item === undefined) break;
      const [productionIndex, dot] = parseItem(item);
      const symbol = productions[productionIndex]?.rhs[dot];
      if (!symbol?.startsWith("N:") || expanded.has(symbol)) continue;
      expanded.add(symbol);
      for (const next of byLhs.get(symbol.slice(2)) ?? []) {
        const key = itemKey(next, 0);
        if (items.has(key)) continue;
        items.add(key);
        pending.push(key);
      }
    }
    return [...items].sort();
  };
  const stateKey = (items: readonly string[]): string => items.join("|");
  const initialKernel = productions
    .flatMap((production, index) => (production.augmented ? [itemKey(index, 0)] : []))
    .sort();
  const initial = closure(initialKernel);
  const states = startProductionCount === 0 ? [] : [initial];
  const stateByKey = new Map([[stateKey(initialKernel), 0]]);
  const transitions = new Map<string, number>();
  for (let state = 0; state < states.length; state += 1) {
    const grouped = new Map<string, string[]>();
    for (const item of states[state] ?? []) {
      const [productionIndex, dot] = parseItem(item);
      const symbol = productions[productionIndex]?.rhs[dot];
      if (symbol === undefined) continue;
      const target = grouped.get(symbol) ?? [];
      target.push(itemKey(productionIndex, dot + 1));
      grouped.set(symbol, target);
    }
    for (const [symbol, items] of grouped) {
      const key = stateKey(items.sort());
      let target = stateByKey.get(key);
      if (target === undefined) {
        target = states.length;
        stateByKey.set(key, target);
        states.push(closure(items));
      }
      transitions.set(`${state}\0${symbol}`, target);
    }
  }

  let shiftReduceConflicts = 0;
  let reduceReduceConflicts = 0;
  const perRule = new Map(rules.map((rule) => [rule.name, 0]));
  states.forEach((items, state) => {
    const actions = new Map<string, Set<string>>();
    const contributors = new Map<string, Set<string>>();
    const addAction = (token: string, action: string, item?: string): void => {
      const entries = actions.get(token) ?? new Set<string>();
      entries.add(action);
      actions.set(token, entries);
      if (item === undefined) return;
      const items = contributors.get(token) ?? new Set<string>();
      items.add(item);
      contributors.set(token, items);
    };
    items.forEach((item) => {
      const [productionIndex, dot] = parseItem(item);
      const production = productions[productionIndex];
      if (!production) return;
      const symbol = production.rhs[dot];
      if (symbol?.startsWith("T:")) {
        const target = transitions.get(`${state}\0${symbol}`);
        if (target !== undefined) addAction(symbol.slice(2), `shift:${target}`, item);
      } else if (symbol === undefined && production.augmented) {
        addAction("end-of-input", "accept");
      } else if (symbol === undefined) {
        for (const token of follow.get(production.lhs) ?? []) {
          addAction(token, `reduce:${productionIndex}`, item);
        }
      }
    });
    actions.forEach((entries, token) => {
      const shifts = [...entries].filter((entry) => entry.startsWith("shift:")).length;
      const reductions = [...entries].filter((entry) => entry.startsWith("reduce:")).length;
      if (shifts > 0 && reductions > 0) shiftReduceConflicts += 1;
      if (reductions > 1) reduceReduceConflicts += 1;
      if (!(shifts > 0 && reductions > 0) && reductions <= 1) return;
      for (const item of contributors.get(token) ?? []) {
        const [productionIndex] = parseItem(item);
        const production = productions[productionIndex];
        if (production === undefined || production.augmented) continue;
        perRule.set(production.lhs, (perRule.get(production.lhs) ?? 0) + 1);
      }
    });
  });
  const counts = [...perRule.values()];
  const total = counts.reduce((sum, count) => sum + count, 0);
  const involvedRules = counts.filter((count) => count > 0).length;
  const p50 = nearestRankPercentile(counts, 0.5);
  const p95 = nearestRankPercentile(counts, 0.95);
  return {
    features: {
      states: states.length,
      shiftReduceConflicts,
      reduceReduceConflicts,
      conflictInvolvement: {
        total,
        involvedRules,
        ...(counts.length === 0 ? {} : { ruleRatio: round4(involvedRules / counts.length) }),
        ...(p50 === undefined || p95 === undefined ? {} : { percentiles: { p50, p95 } }),
      },
    },
    perRule,
  };
};

export const parseabilityAnalysis = (
  ir: GrammarIR,
  options: ParseabilityOptions = {},
): ParseabilityAnalysis => {
  const rules = mergeRulesByName(ir.rules);
  const ruleNames = new Set(rules.map((rule) => rule.name));
  const unitGraph = new Map<string, Set<string>>(rules.map((rule) => [rule.name, new Set()]));
  const unitRulesByRule = new Map(rules.map((rule) => [rule.name, 0]));
  let unitRules = 0;
  rules.forEach((rule) => {
    const parameters = new Set(rule.params);
    rule.alternatives.forEach((alternative) => {
      const target = unitTarget(alternative, ruleNames, parameters);
      if (target === undefined) return;
      unitRules += 1;
      unitRulesByRule.set(rule.name, (unitRulesByRule.get(rule.name) ?? 0) + 1);
      unitGraph.get(rule.name)?.add(target);
    });
  });
  const cyclicUnitRules = stronglyConnectedComponents(unitGraph)
    .filter(
      (component) =>
        component.length > 1 ||
        (component[0] !== undefined && unitGraph.get(component[0])?.has(component[0]) === true),
    )
    .sort((left, right) => compareBytes(left.join("\0"), right.join("\0")));
  let cfgNotApplicable = ir.capabilities.orderedChoice
    ? "orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply"
    : ir.capabilities.predicates
      ? "predicates grammar: CFG FIRST, FOLLOW, LL(1), and SLR analysis does not apply"
      : undefined;
  if (cfgNotApplicable === undefined && ir.capabilities.parameterizedRules) {
    const expanded = expandParameterizedRules(ir);
    if (!expanded.ok) cfgNotApplicable = expanded.reason;
    else {
      const derived = parseabilityAnalysis(expanded.ir, options);
      const sourceRules = new Set(expanded.sourceRuleNames);
      return {
        features: {
          ...derived.features,
          unitRules,
          cyclicUnitRules,
          context: {
            representation: "parameter-expansion-bnf-v1",
            sourceRules: ir.rules.length,
            concreteRules: expanded.ir.rules.length,
            parameterInstances: expanded.instanceCount,
            ebnfHelpers: expanded.helperCount,
            omittedTemplateRules: [...expanded.omittedTemplateNames],
            effectiveCapabilities: {
              ...expanded.ir.capabilities,
              orderedChoice: false,
              predicates: false,
              parameterizedRules: false,
              ebnfSugar: false,
            },
            limits: {
              instances: PARAMETER_EXPANSION_LIMITS.maxInstances,
              nodeVisits: PARAMETER_EXPANSION_LIMITS.maxNodeVisits,
              depth: PARAMETER_EXPANSION_LIMITS.maxDepth,
              keyBytes: PARAMETER_EXPANSION_LIMITS.maxKeyBytes,
            },
          },
        },
        perRule: new Map(
          rules.map((rule) => [
            rule.name,
            {
              ...(sourceRules.has(rule.name) ? derived.perRule.get(rule.name) : {}),
              unitRules: unitRulesByRule.get(rule.name) ?? 0,
            },
          ]),
        ),
      };
    }
  }
  if (cfgNotApplicable !== undefined) {
    return {
      features: {
        unitRules,
        cyclicUnitRules,
        notApplicable: {
          firstSetSize: cfgNotApplicable,
          followSetSize: cfgNotApplicable,
          ll1Conflicts: cfgNotApplicable,
          slr: cfgNotApplicable,
        },
      },
      perRule: new Map(
        rules.map((rule) => [rule.name, { unitRules: unitRulesByRule.get(rule.name) ?? 0 }]),
      ),
    };
  }

  const nullable = computeNullableRules({ ...ir, rules });
  const tokens = tokenUniverse({ ...ir, rules }, ruleNames);
  const first = computeFirstSets({ ...ir, rules }, nullable, tokens);
  const follow = computeFollowSets({ ...ir, rules }, first, nullable, tokens);
  let firstFirst = 0;
  let firstFollow = 0;
  const perRule = new Map<string, RuleParseabilityMetrics>();
  rules.forEach((rule) => {
    const alternatives = rule.alternatives.map((alternative) => ({
      first: firstAlternative(alternative, first, nullable, tokens),
      nullable: alternative.items.every((item) => isExpressionNullable(item, nullable)),
    }));
    let ruleFirstFirst = 0;
    let ruleFirstFollow = 0;
    for (let left = 0; left < alternatives.length; left += 1) {
      for (let right = left + 1; right < alternatives.length; right += 1) {
        const leftAlt = alternatives[left];
        const rightAlt = alternatives[right];
        if (!leftAlt || !rightAlt) continue;
        if (leftAlt.first.intersects(rightAlt.first)) {
          firstFirst += 1;
          ruleFirstFirst += 1;
        }
        const ruleFollow = follow.get(rule.name) ?? tokens.set();
        if (
          (leftAlt.nullable && rightAlt.first.intersects(ruleFollow)) ||
          (rightAlt.nullable && leftAlt.first.intersects(ruleFollow)) ||
          (leftAlt.nullable && rightAlt.nullable && ruleFollow.size > 0)
        ) {
          firstFollow += 1;
          ruleFirstFollow += 1;
        }
      }
    }
    perRule.set(rule.name, {
      firstSetSize: first.get(rule.name)?.size ?? 0,
      followSetSize: follow.get(rule.name)?.size ?? 0,
      ll1Conflicts: {
        firstFirst: ruleFirstFirst,
        firstFollow: ruleFirstFollow,
        total: ruleFirstFirst + ruleFirstFollow,
      },
      unitRules: unitRulesByRule.get(rule.name) ?? 0,
    });
  });
  const firstSetSize = distribution(first);
  const followSetSize = distribution(follow);
  const slr = options.lr ? slrFeatures({ ...ir, rules }, follow) : undefined;
  slr?.perRule.forEach((slrConflictInvolvement, name) => {
    const metrics = perRule.get(name);
    if (metrics !== undefined) perRule.set(name, { ...metrics, slrConflictInvolvement });
  });
  const notApplicable: Record<string, string> = {};
  if (!options.lr) notApplicable.slr = "requires --analysis lr";
  else if (slr === undefined) notApplicable.slr = "SLR analysis requires plain BNF expressions";
  if (rules.length === 0) {
    notApplicable.firstSetSize = "grammar has no rules";
    notApplicable.followSetSize = "grammar has no rules";
    if (slr !== undefined) {
      notApplicable["slr.conflictInvolvement.ruleRatio"] = "grammar has no rules";
      notApplicable["slr.conflictInvolvement.percentiles"] = "grammar has no rules";
    }
  }
  return {
    features: {
      ...(firstSetSize === undefined ? {} : { firstSetSize }),
      ...(followSetSize === undefined ? {} : { followSetSize }),
      ll1Conflicts: { firstFirst, firstFollow, total: firstFirst + firstFollow },
      unitRules,
      cyclicUnitRules,
      ...(slr === undefined ? {} : { slr: slr.features }),
      ...(Object.keys(notApplicable).length === 0 ? {} : { notApplicable }),
    },
    perRule,
  };
};
