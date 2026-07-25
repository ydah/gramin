import type { GrammarFeatures, GrammarIR } from "@gramin/core";
import { alternativeRhsLength, collectReferences, walkExpression } from "./expressions.js";
import { compareBytes, round4 } from "./numbers.js";

const maxRuleMetric = (
  entries: readonly { readonly rule: string; readonly value: number; readonly line?: number }[],
): GrammarFeatures["size"]["maxAltPerRule"] => {
  const selected = [...entries].sort(
    (left, right) => right.value - left.value || compareBytes(left.rule, right.rule),
  )[0];
  return selected ?? { value: 0, rule: "" };
};

export const unresolvedSymbols = (ir: GrammarIR): string[] => {
  const known = new Set([
    ...ir.rules.map((rule) => rule.name),
    ...ir.terminals.flatMap((terminal) => (terminal.name ? [terminal.name] : [])),
    ...ir.externalSymbols.map((symbol) => symbol.name),
  ]);
  const unresolved = new Set<string>();
  ir.rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      for (const reference of collectReferences(alternative)) {
        if (!known.has(reference)) unresolved.add(reference);
      }
    });
  });
  return [...unresolved].sort(compareBytes);
};

export const sizeFeatures = (ir: GrammarIR): GrammarFeatures["size"] => {
  const alternatives = ir.rules.flatMap((rule) =>
    rule.alternatives.map((alternative) => ({ rule, alternative })),
  );
  const rhsLengths = alternatives.map(({ rule, alternative }) => ({
    rule: rule.name,
    value: alternativeRhsLength(alternative),
    ...(rule.loc === undefined ? {} : { line: rule.loc.startLine }),
  }));
  const nestedChoiceCount = alternatives.reduce((count, { alternative }) => {
    let nested = 0;
    alternative.items.forEach((item) => {
      walkExpression(item, (expression) => {
        if (expression.kind === "choice") nested += 1;
      });
    });
    return count + nested;
  }, 0);
  const unresolved = unresolvedSymbols(ir);
  const alternativeCount = alternatives.length;
  const rhsTotal = rhsLengths.reduce((total, entry) => total + entry.value, 0);

  return {
    terminals: ir.terminals.length,
    nonterminals: ir.rules.length,
    rules: ir.rules.length,
    alternatives: alternativeCount,
    unresolvedSymbols: { count: unresolved.length, names: unresolved },
    avgAltPerRule: round4(ir.rules.length === 0 ? 0 : alternativeCount / ir.rules.length),
    maxAltPerRule: maxRuleMetric(
      ir.rules.map((rule) => ({
        rule: rule.name,
        value: rule.alternatives.length,
        ...(rule.loc === undefined ? {} : { line: rule.loc.startLine }),
      })),
    ),
    avgRhsLength: round4(alternativeCount === 0 ? 0 : rhsTotal / alternativeCount),
    maxRhsLength: maxRuleMetric(rhsLengths),
    nestedChoiceCount,
    emptyAlternatives: rhsLengths.filter((entry) => entry.value === 0).length,
  };
};
