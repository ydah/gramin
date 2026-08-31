import {
  type Alternative,
  canonicalize,
  type Expr,
  type GrammarFeatures,
  type GrammarIR,
  mergeRulesByName,
} from "@gramin/core";
import {
  alternativeEdgeReference,
  alternativeRhsLength,
  collectReferences,
  walkExpression,
} from "./expressions.js";
import { compareBytes, round4 } from "./numbers.js";

const expressionKey = (expression: Expr): string => JSON.stringify(canonicalize(expression));

const syntaxItems = (alternative: Alternative): readonly Expr[] =>
  alternative.items.filter((item) => item.kind !== "midRuleAction");

const alternativeKey = (alternative: Alternative): string =>
  JSON.stringify({
    items: syntaxItems(alternative).map(expressionKey),
    precedence: alternative.precedence,
  });

const expressionSize = (expression: Expr): number => {
  let size = 0;
  walkExpression(expression, () => {
    size += 1;
  });
  return size;
};

const terminalName = (terminal: GrammarIR["terminals"][number]): string =>
  terminal.name ?? terminal.literal ?? "";

const listRecursionDirections = (
  rule: GrammarIR["rules"][number],
): { readonly left: boolean; readonly right: boolean } => {
  // ponytail: H/C detection uses conventional names; widen only with corpus evidence.
  const listLikeName = /list|items?|elements?|members?|arguments?|parameters?|statements?/iu.test(
    rule.name,
  );
  const hasBaseAlternative = rule.alternatives.some(
    (alternative) =>
      alternativeRhsLength(alternative) > 0 && !collectReferences(alternative).has(rule.name),
  );
  if (!listLikeName || !hasBaseAlternative) return { left: false, right: false };
  return {
    left: rule.alternatives.some(
      (alternative) =>
        alternativeRhsLength(alternative) > 1 &&
        alternativeEdgeReference(alternative, "first") === rule.name,
    ),
    right: rule.alternatives.some(
      (alternative) =>
        alternativeRhsLength(alternative) > 1 &&
        alternativeEdgeReference(alternative, "last") === rule.name,
    ),
  };
};

export const redundancyFeatures = (ir: GrammarIR): GrammarFeatures["redundancy"] => {
  const rules = mergeRulesByName(ir.rules);
  let commonPrefixPairs = 0;
  let maxCommonPrefixLength = 0;
  let duplicateAlternatives = 0;
  const cloneLocations = new Map<string, Set<string>>();
  const referenceCounts = new Map(rules.map((rule) => [rule.name, 0]));
  const usedTerminals = new Set<string>();
  let leftLists = 0;
  let rightLists = 0;
  let mixedLists = 0;

  rules.forEach((rule) => {
    const seenAlternatives = new Set<string>();
    const { left: leftRecursive, right: rightRecursive } = listRecursionDirections(rule);
    if (leftRecursive && rightRecursive) mixedLists += 1;
    else if (leftRecursive) leftLists += 1;
    else if (rightRecursive) rightLists += 1;
    rule.alternatives.forEach((alternative, alternativeIndex) => {
      const key = alternativeKey(alternative);
      if (seenAlternatives.has(key)) duplicateAlternatives += 1;
      seenAlternatives.add(key);
      alternative.items.forEach((item) => {
        walkExpression(item, (expression) => {
          if (expression.kind === "symbol" && referenceCounts.has(expression.name)) {
            referenceCounts.set(expression.name, (referenceCounts.get(expression.name) ?? 0) + 1);
          }
          if (expression.kind === "terminal") {
            if (expression.name !== undefined) usedTerminals.add(expression.name);
            if (expression.literal !== undefined) usedTerminals.add(expression.literal);
          }
          if (expressionSize(expression) < 3) return;
          const locations = cloneLocations.get(expressionKey(expression)) ?? new Set<string>();
          locations.add(`${rule.name}:${alternativeIndex}`);
          cloneLocations.set(expressionKey(expression), locations);
        });
      });
    });
    for (let left = 0; left < rule.alternatives.length; left += 1) {
      for (let right = left + 1; right < rule.alternatives.length; right += 1) {
        const leftItems = syntaxItems(rule.alternatives[left] as Alternative);
        const rightItems = syntaxItems(rule.alternatives[right] as Alternative);
        let length = 0;
        while (
          length < leftItems.length &&
          length < rightItems.length &&
          expressionKey(leftItems[length] as Expr) === expressionKey(rightItems[length] as Expr)
        ) {
          length += 1;
        }
        if (length === 0) continue;
        commonPrefixPairs += 1;
        maxCommonPrefixLength = Math.max(maxCommonPrefixLength, length);
      }
    }
  });

  const precedenceTokens = new Set(ir.precedence.flatMap((level) => level.tokens));
  const overrides = new Set(
    rules.flatMap((rule) =>
      rule.alternatives.flatMap((alternative) =>
        alternative.precedence === undefined ? [] : [alternative.precedence],
      ),
    ),
  );
  const unusedTerminals = ir.terminals
    .filter(
      (terminal) =>
        !usedTerminals.has(terminal.name ?? "") && !usedTerminals.has(terminal.literal ?? ""),
    )
    .map(terminalName)
    .filter(Boolean)
    .sort(compareBytes);
  return {
    commonPrefixPairs,
    maxCommonPrefixLength,
    duplicateAlternatives,
    structuralCloneGroups: [...cloneLocations.values()].filter((locations) => locations.size > 1)
      .length,
    singleReferenceRules: [...referenceCounts]
      .filter(([, count]) => count === 1)
      .map(([name]) => name)
      .sort(compareBytes),
    unusedTerminals,
    unusedPrecedenceTokens: [...precedenceTokens]
      .filter((token) => !usedTerminals.has(token) && !overrides.has(token))
      .sort(compareBytes),
    undefinedPrecedenceOverrides: [...overrides]
      .filter((token) => !precedenceTokens.has(token))
      .sort(compareBytes),
    listRecursion: {
      left: leftLists,
      right: rightLists,
      mixed: mixedLists,
      consistency: round4(
        leftLists + rightLists + mixedLists === 0
          ? 0
          : Math.max(leftLists, rightLists) / (leftLists + rightLists + mixedLists),
      ),
    },
  };
};
