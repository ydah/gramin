import {
  type Alternative,
  type Expr,
  type GrammarFeatures,
  type GrammarIR,
  mergeRulesByName,
} from "@gramin/core";
import { isExpressionNullable } from "./expressions.js";
import { stronglyConnectedComponents } from "./graph.js";
import { compareBytes, nearestRankPercentile, round4 } from "./numbers.js";
import { computeNullableRules } from "./structure.js";

type TokenSet = Set<string>;

const addAll = (target: TokenSet, values: ReadonlySet<string>): boolean => {
  const before = target.size;
  values.forEach((value) => {
    target.add(value);
  });
  return target.size !== before;
};

const terminalKey = (expression: Extract<Expr, { kind: "terminal" }>): string =>
  expression.name === undefined ? `literal:${expression.literal}` : `name:${expression.name}`;

const firstExpression = (
  expression: Expr,
  firstRules: ReadonlyMap<string, ReadonlySet<string>>,
  nullable: ReadonlySet<string>,
): TokenSet => {
  if (expression.kind === "terminal") return new Set([terminalKey(expression)]);
  if (expression.kind === "charClass") return new Set([`class:${expression.pattern}`]);
  if (expression.kind === "anyChar") return new Set(["any-char"]);
  if (expression.kind === "symbol") {
    return new Set(firstRules.get(expression.name) ?? [`symbol:${expression.name}`]);
  }
  if (expression.kind === "midRuleAction" || expression.kind === "predicate") return new Set();
  if (expression.kind === "choice") {
    const result = new Set<string>();
    expression.alts.forEach((alternative) => {
      addAll(result, firstExpression(alternative, firstRules, nullable));
    });
    return result;
  }
  if (expression.kind === "seq") {
    const result = new Set<string>();
    for (const item of expression.items) {
      addAll(result, firstExpression(item, firstRules, nullable));
      if (!isExpressionNullable(item, nullable)) break;
    }
    return result;
  }
  return firstExpression(expression.expr, firstRules, nullable);
};

const firstAlternative = (
  alternative: Alternative,
  firstRules: ReadonlyMap<string, ReadonlySet<string>>,
  nullable: ReadonlySet<string>,
): TokenSet => firstExpression({ kind: "seq", items: alternative.items }, firstRules, nullable);

const computeFirstSets = (ir: GrammarIR, nullable: ReadonlySet<string>): Map<string, TokenSet> => {
  const rules = mergeRulesByName(ir.rules);
  const first = new Map(rules.map((rule) => [rule.name, new Set<string>()]));
  let changed = true;
  while (changed) {
    changed = false;
    rules.forEach((rule) => {
      const target = first.get(rule.name);
      if (!target) return;
      rule.alternatives.forEach((alternative) => {
        if (addAll(target, firstAlternative(alternative, first, nullable))) changed = true;
      });
    });
  }
  return first;
};

const propagateFollow = (
  expression: Expr,
  trailer: ReadonlySet<string>,
  first: ReadonlyMap<string, ReadonlySet<string>>,
  follow: ReadonlyMap<string, TokenSet>,
  nullable: ReadonlySet<string>,
): boolean => {
  if (expression.kind === "symbol") {
    const target = follow.get(expression.name);
    return target ? addAll(target, trailer) : false;
  }
  if (expression.kind === "seq") {
    let changed = false;
    let next = new Set(trailer);
    for (let index = expression.items.length - 1; index >= 0; index -= 1) {
      const item = expression.items[index];
      if (!item) continue;
      if (propagateFollow(item, next, first, follow, nullable)) changed = true;
      const itemFirst = firstExpression(item, first, nullable);
      next = isExpressionNullable(item, nullable) ? new Set([...itemFirst, ...next]) : itemFirst;
    }
    return changed;
  }
  if (expression.kind === "choice") {
    return expression.alts.reduce(
      (changed, alternative) =>
        propagateFollow(alternative, trailer, first, follow, nullable) || changed,
      false,
    );
  }
  if (expression.kind === "star" || expression.kind === "plus") {
    return propagateFollow(
      expression.expr,
      new Set([...trailer, ...firstExpression(expression.expr, first, nullable)]),
      first,
      follow,
      nullable,
    );
  }
  if (expression.kind === "opt" || expression.kind === "group") {
    return propagateFollow(expression.expr, trailer, first, follow, nullable);
  }
  return false;
};

const computeFollowSets = (
  ir: GrammarIR,
  first: ReadonlyMap<string, ReadonlySet<string>>,
  nullable: ReadonlySet<string>,
): Map<string, TokenSet> => {
  const rules = mergeRulesByName(ir.rules);
  const follow = new Map(rules.map((rule) => [rule.name, new Set<string>()]));
  ir.startSymbols.forEach((symbol) => {
    follow.get(symbol)?.add("end-of-input");
  });
  let changed = true;
  while (changed) {
    changed = false;
    rules.forEach((rule) => {
      const trailer = follow.get(rule.name) ?? new Set<string>();
      rule.alternatives.forEach((alternative) => {
        if (
          propagateFollow(
            { kind: "seq", items: alternative.items },
            trailer,
            first,
            follow,
            nullable,
          )
        ) {
          changed = true;
        }
      });
    });
  }
  return follow;
};

const intersects = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean =>
  [...left].some((value) => right.has(value));

const distribution = (
  values: ReadonlyMap<string, ReadonlySet<string>>,
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
): string | undefined => {
  const items = alternative.items.filter((item) => item.kind !== "midRuleAction");
  let item: Expr | undefined = items[0];
  while (item?.kind === "group") item = item.expr;
  return items.length === 1 && item?.kind === "symbol" && ruleNames.has(item.name)
    ? item.name
    : undefined;
};

export const parseabilityFeatures = (ir: GrammarIR): GrammarFeatures["parseability"] => {
  const rules = mergeRulesByName(ir.rules);
  const ruleNames = new Set(rules.map((rule) => rule.name));
  const unitGraph = new Map<string, Set<string>>(rules.map((rule) => [rule.name, new Set()]));
  let unitRules = 0;
  rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      const target = unitTarget(alternative, ruleNames);
      if (target === undefined) return;
      unitRules += 1;
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
  if (ir.capabilities.orderedChoice) {
    const reason = "orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply";
    return {
      unitRules,
      cyclicUnitRules,
      notApplicable: { firstSetSize: reason, followSetSize: reason, ll1Conflicts: reason },
    };
  }

  const nullable = computeNullableRules({ ...ir, rules });
  const first = computeFirstSets({ ...ir, rules }, nullable);
  const follow = computeFollowSets({ ...ir, rules }, first, nullable);
  let firstFirst = 0;
  let firstFollow = 0;
  rules.forEach((rule) => {
    const alternatives = rule.alternatives.map((alternative) => ({
      first: firstAlternative(alternative, first, nullable),
      nullable: alternative.items.every((item) => isExpressionNullable(item, nullable)),
    }));
    for (let left = 0; left < alternatives.length; left += 1) {
      for (let right = left + 1; right < alternatives.length; right += 1) {
        const leftAlt = alternatives[left];
        const rightAlt = alternatives[right];
        if (!leftAlt || !rightAlt) continue;
        if (intersects(leftAlt.first, rightAlt.first)) firstFirst += 1;
        const ruleFollow = follow.get(rule.name) ?? new Set<string>();
        if (
          (leftAlt.nullable && intersects(rightAlt.first, ruleFollow)) ||
          (rightAlt.nullable && intersects(leftAlt.first, ruleFollow))
        ) {
          firstFollow += 1;
        }
      }
    }
  });
  const firstSetSize = distribution(first);
  const followSetSize = distribution(follow);
  return {
    ...(firstSetSize === undefined ? {} : { firstSetSize }),
    ...(followSetSize === undefined ? {} : { followSetSize }),
    ll1Conflicts: { firstFirst, firstFollow, total: firstFirst + firstFollow },
    unitRules,
    cyclicUnitRules,
    ...(rules.length === 0
      ? {
          notApplicable: {
            firstSetSize: "grammar has no rules",
            followSetSize: "grammar has no rules",
          },
        }
      : {}),
  };
};
