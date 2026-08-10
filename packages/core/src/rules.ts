import type { Rule } from "./schemas/ir.js";

/** Merge repeated rule declarations into the canonical single-rule form. */
export const mergeRulesByName = (rules: readonly Rule[]): Rule[] => {
  const merged = new Map<string, Rule>();
  for (const rule of rules) {
    const existing = merged.get(rule.name);
    if (!existing) {
      merged.set(rule.name, { ...rule, alternatives: [...rule.alternatives] });
      continue;
    }
    merged.set(rule.name, {
      ...existing,
      alternatives: [...existing.alternatives, ...rule.alternatives],
      ...(existing.orderedAlternatives || rule.orderedAlternatives
        ? { orderedAlternatives: true }
        : {}),
    });
  }
  return [...merged.values()];
};
