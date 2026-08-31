import {
  canonicalize,
  type Expr,
  type GrammarFeatures,
  type GrammarIR,
  mergeRulesByName,
} from "@gramin/core";
import { walkExpression } from "./expressions.js";
import { compareBytes, round4 } from "./numbers.js";

const expressionKey = (expression: Expr): string => JSON.stringify(canonicalize(expression));

const sequenceItems = (expression: Expr): readonly Expr[] =>
  expression.kind === "seq" ? expression.items : [expression];

const commonPrefixLength = (left: readonly Expr[], right: readonly Expr[]): number => {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    expressionKey(left[length] as Expr) === expressionKey(right[length] as Expr)
  ) {
    length += 1;
  }
  return length;
};

const isLiteralPrefix = (left: Expr | undefined, right: Expr | undefined): boolean =>
  left?.kind === "terminal" &&
  right?.kind === "terminal" &&
  left.literal !== undefined &&
  right.literal?.startsWith(left.literal) === true;

const shadows = (left: readonly Expr[], right: readonly Expr[]): boolean => {
  const shared = commonPrefixLength(left, right);
  return shared === left.length || (shared === 0 && isLiteralPrefix(left[0], right[0]));
};

interface Interval {
  readonly start: number;
  readonly end: number;
}

const escapedCodePoint = (pattern: string, index: number): [number, number] | undefined => {
  const escaped = pattern[index + 1];
  if (escaped === undefined || escaped === "p" || escaped === "P") return undefined;
  const simple: Readonly<Record<string, number>> = { n: 10, r: 13, t: 9, f: 12, v: 11 };
  if (simple[escaped] !== undefined) return [simple[escaped], index + 2];
  if (escaped === "x") {
    const value = pattern.slice(index + 2, index + 4);
    return /^[0-9A-Fa-f]{2}$/u.test(value) ? [Number.parseInt(value, 16), index + 4] : undefined;
  }
  if (escaped === "u" && pattern[index + 2] === "{") {
    const end = pattern.indexOf("}", index + 3);
    if (end < 0) return undefined;
    const value = pattern.slice(index + 3, end);
    return /^[0-9A-Fa-f]+$/u.test(value) ? [Number.parseInt(value, 16), end + 1] : undefined;
  }
  if (escaped === "u") {
    const value = pattern.slice(index + 2, index + 6);
    return /^[0-9A-Fa-f]{4}$/u.test(value) ? [Number.parseInt(value, 16), index + 6] : undefined;
  }
  return [escaped.codePointAt(0) ?? 0, index + 2];
};

const patternCodePoint = (pattern: string, index: number): [number, number] | undefined => {
  if (pattern[index] === "\\") return escapedCodePoint(pattern, index);
  const value = pattern.codePointAt(index);
  if (value === undefined) return undefined;
  return [value, index + (value > 0xffff ? 2 : 1)];
};

const mergeIntervals = (intervals: readonly Interval[]): Interval[] => {
  const merged: Interval[] = [];
  [...intervals]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .forEach((interval) => {
      const previous = merged.at(-1);
      if (!previous || interval.start > previous.end + 1) {
        merged.push(interval);
        return;
      }
      merged[merged.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, interval.end),
      };
    });
  return merged;
};

const classIntervals = (pattern: string, negated: boolean): Interval[] | undefined => {
  const intervals: Interval[] = [];
  let index = 0;
  while (index < pattern.length) {
    const first = patternCodePoint(pattern, index);
    if (!first) return undefined;
    const [start, afterStart] = first;
    if (pattern[afterStart] === "-" && afterStart + 1 < pattern.length) {
      const last = patternCodePoint(pattern, afterStart + 1);
      if (!last) return undefined;
      intervals.push({ start: Math.min(start, last[0]), end: Math.max(start, last[0]) });
      index = last[1];
    } else {
      intervals.push({ start, end: start });
      index = afterStart;
    }
  }
  const merged = mergeIntervals(intervals);
  if (!negated) return merged;
  const complement: Interval[] = [];
  let start = 0;
  merged.forEach((interval) => {
    if (start < interval.start) complement.push({ start, end: interval.start - 1 });
    start = interval.end + 1;
  });
  if (start <= 0x10ffff) complement.push({ start, end: 0x10ffff });
  return complement;
};

const intervalSetsOverlap = (left: readonly Interval[], right: readonly Interval[]): boolean => {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftInterval = left[leftIndex];
    const rightInterval = right[rightIndex];
    if (!leftInterval || !rightInterval) break;
    if (leftInterval.end < rightInterval.start) leftIndex += 1;
    else if (rightInterval.end < leftInterval.start) rightIndex += 1;
    else return true;
  }
  return false;
};

export const pegFeatures = (ir: GrammarIR): GrammarFeatures["peg"] => {
  if (!ir.capabilities.orderedChoice) {
    const reason = "orderedChoice capability is false";
    return {
      notApplicable: {
        predicates: reason,
        maxPredicateNestingDepth: reason,
        shadowedAlternativePairs: reason,
        backtrackingHotspots: reason,
        charClassOverlapPairs: reason,
      },
    };
  }
  let predicates = 0;
  let maxPredicateNestingDepth = 0;
  const choiceGroups = new Map<string, (readonly (readonly Expr[])[])[]>();
  ir.rules.forEach((rule) => {
    choiceGroups.set(rule.name, [rule.alternatives.map((alternative) => alternative.items)]);
    rule.alternatives.forEach((alternative) => {
      const pending = alternative.items.map((expression) => ({ expression, predicateDepth: 0 }));
      while (pending.length > 0) {
        const item = pending.pop();
        if (!item) break;
        const depth = item.predicateDepth + (item.expression.kind === "predicate" ? 1 : 0);
        if (item.expression.kind === "predicate") {
          predicates += 1;
          maxPredicateNestingDepth = Math.max(maxPredicateNestingDepth, depth);
        }
        if (item.expression.kind === "choice" && item.expression.ordered) {
          choiceGroups.get(rule.name)?.push(item.expression.alts.map(sequenceItems));
        }
        const children =
          item.expression.kind === "symbol"
            ? item.expression.args
            : item.expression.kind === "seq"
              ? item.expression.items
              : item.expression.kind === "choice"
                ? item.expression.alts
                : item.expression.kind === "opt" ||
                    item.expression.kind === "star" ||
                    item.expression.kind === "plus" ||
                    item.expression.kind === "predicate" ||
                    item.expression.kind === "group"
                  ? [item.expression.expr]
                  : undefined;
        children?.forEach((expression) => {
          pending.push({ expression, predicateDepth: depth });
        });
      }
    });
  });

  let shadowedAlternativePairs = 0;
  const backtrackingHotspots: { rule: string; score: number }[] = [];
  mergeRulesByName(ir.rules).forEach((rule) => {
    let score = 0;
    for (const group of choiceGroups.get(rule.name) ?? []) {
      const alternatives = group.map((items) =>
        items.filter((item) => item.kind !== "midRuleAction"),
      );
      for (let left = 0; left < alternatives.length; left += 1) {
        for (let right = left + 1; right < alternatives.length; right += 1) {
          const leftItems = alternatives[left] ?? [];
          const rightItems = alternatives[right] ?? [];
          const shared = commonPrefixLength(leftItems, rightItems);
          if (shadows(leftItems, rightItems)) shadowedAlternativePairs += 1;
          score += shared * (right + 1);
        }
      }
    }
    if (score > 0) backtrackingHotspots.push({ rule: rule.name, score });
  });

  const classGroups = [...choiceGroups.values()].flatMap((groups) =>
    groups.map((group) =>
      group.flatMap((items) => {
        const first = items.find((item) => item.kind !== "midRuleAction");
        return first?.kind === "charClass" ? [first] : [];
      }),
    ),
  );
  const parsedClasses = classGroups.map((group) =>
    group.map((entry) => classIntervals(entry.pattern, entry.negated === true)),
  );
  let charClassOverlapPairs = 0;
  const hasUnsupportedClass = parsedClasses.some((group) =>
    group.some((entry) => entry === undefined),
  );
  if (!hasUnsupportedClass) {
    for (const group of parsedClasses) {
      for (let left = 0; left < group.length; left += 1) {
        for (let right = left + 1; right < group.length; right += 1) {
          if (intervalSetsOverlap(group[left] ?? [], group[right] ?? [])) {
            charClassOverlapPairs += 1;
          }
        }
      }
    }
  }
  return {
    predicates,
    maxPredicateNestingDepth,
    shadowedAlternativePairs,
    backtrackingHotspots: backtrackingHotspots
      .sort((left, right) => right.score - left.score || compareBytes(left.rule, right.rule))
      .slice(0, 10),
    ...(hasUnsupportedClass ? {} : { charClassOverlapPairs }),
    ...(hasUnsupportedClass
      ? {
          notApplicable: {
            charClassOverlapPairs: "a character class uses an unsupported Unicode property escape",
          },
        }
      : {}),
  };
};

export const operationsFeatures = (ir: GrammarIR): GrammarFeatures["operations"] => {
  let errorTokenUses = 0;
  let namedReferences = 0;
  let symbolReferences = 0;
  let rulesWithErrorRecovery = 0;
  ir.rules.forEach((rule) => {
    let recovers = false;
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach((item) => {
        walkExpression(item, (expression) => {
          if (expression.kind === "symbol") {
            symbolReferences += 1;
            if (expression.label !== undefined) namedReferences += 1;
            if (expression.name === "error") {
              errorTokenUses += 1;
              recovers = true;
            }
          }
          if (
            expression.kind === "terminal" &&
            (expression.name === "error" || expression.literal === "error")
          ) {
            errorTokenUses += 1;
            recovers = true;
          }
        });
      });
    });
    if (recovers) rulesWithErrorRecovery += 1;
  });
  const declarations = ir.sourceMetrics?.declarationDirectives;
  const explicitEmptyCount = ir.sourceMetrics?.explicitEmptyAlternatives;
  const emptyAlternatives = ir.rules.reduce(
    (total, rule) =>
      total +
      rule.alternatives.filter((alternative) =>
        alternative.items.every((item) => item.kind === "midRuleAction"),
      ).length,
    0,
  );
  const actionReferences = ir.sourceMetrics?.actionReferences;
  const notApplicable: Record<string, string> = {};
  if (declarations === undefined) {
    notApplicable.declarationDirectives = "source frontend did not retain declaration directives";
  }
  if (explicitEmptyCount === undefined) {
    notApplicable.explicitEmptyAlternatives =
      "source frontend did not distinguish explicit empty alternatives";
  }
  if (actionReferences === undefined) {
    notApplicable.actionReferences =
      "source frontend did not retain opaque action reference counts";
  }
  return {
    errorTokenUses,
    rulesWithErrorRecovery,
    recoveryRuleRatio: round4(ir.rules.length === 0 ? 0 : rulesWithErrorRecovery / ir.rules.length),
    namedReferences,
    symbolReferences,
    namedReferenceRatio: round4(symbolReferences === 0 ? 0 : namedReferences / symbolReferences),
    ...(declarations === undefined
      ? {}
      : {
          declarationDirectives: {
            ...declarations,
            total:
              declarations.destructor +
              declarations.printer +
              declarations.union +
              declarations.code,
          },
        }),
    ...(explicitEmptyCount === undefined
      ? {}
      : {
          explicitEmptyAlternatives: {
            count: explicitEmptyCount,
            emptyAlternatives,
            ratio: round4(emptyAlternatives === 0 ? 0 : explicitEmptyCount / emptyAlternatives),
          },
        }),
    ...(actionReferences === undefined
      ? {}
      : {
          actionReferences: {
            ...actionReferences,
            total: actionReferences.positional + actionReferences.named,
            namedRatio: round4(
              actionReferences.positional + actionReferences.named === 0
                ? 0
                : actionReferences.named / (actionReferences.positional + actionReferences.named),
            ),
          },
        }),
    ...(Object.keys(notApplicable).length === 0 ? {} : { notApplicable }),
  };
};

export const styleFeatures = (ir: GrammarIR): GrammarFeatures["style"] => {
  const terminalNames = ir.terminals.flatMap((terminal) =>
    terminal.name === undefined ? [] : [terminal.name],
  );
  const upperCaseNames = terminalNames.filter((name) => /^[A-Z][A-Z0-9_]*$/u.test(name));
  const snakeCaseNames = ir.rules
    .map((rule) => rule.name)
    .filter((name) => /^[a-z][a-z0-9_]*$/u.test(name));
  const camelCaseNames = ir.rules
    .map((rule) => rule.name)
    .filter((name) => /^[a-z][A-Za-z0-9]*$/u.test(name) && /[A-Z]/u.test(name));
  const convention =
    ir.rules.length === 0
      ? "none"
      : snakeCaseNames.length === camelCaseNames.length
        ? "mixed"
        : snakeCaseNames.length > camelCaseNames.length
          ? "snake_case"
          : "camelCase";
  const matching =
    convention === "snake_case" ? snakeCaseNames : convention === "camelCase" ? camelCaseNames : [];
  const matchingNames = new Set(matching);
  const comments = ir.sourceMetrics?.comments;
  const documentedRules = new Set(comments?.documentedRules ?? []);
  const sourceCharacters = ir.sourceMetrics?.sourceCharacters;
  return {
    terminalUpperCaseRatio: round4(
      terminalNames.length === 0 ? 0 : upperCaseNames.length / terminalNames.length,
    ),
    nonterminalConvention: convention,
    nonterminalConventionRatio: round4(
      ir.rules.length === 0 ? 0 : matching.length / ir.rules.length,
    ),
    namingOutliers:
      convention === "mixed" || convention === "none"
        ? []
        : ir.rules
            .map((rule) => rule.name)
            .filter((name) => !matchingNames.has(name))
            .sort(compareBytes),
    ...(comments === undefined || sourceCharacters === undefined
      ? {
          notApplicable: {
            commentDensity: "source frontend did not retain comment statistics",
            comments: "source frontend did not retain comment statistics",
            undocumentedRules: "source frontend did not retain rule documentation comments",
            documentedRuleRatio: "source frontend did not retain rule documentation comments",
          },
        }
      : {
          commentDensity: round4(
            sourceCharacters === 0 ? 0 : comments.characters / sourceCharacters,
          ),
          comments: comments.count,
          undocumentedRules: ir.rules
            .map((rule) => rule.name)
            .filter((name) => !documentedRules.has(name))
            .sort(compareBytes),
          documentedRuleRatio: round4(
            ir.rules.length === 0 ? 0 : documentedRules.size / ir.rules.length,
          ),
        }),
  };
};
