import { compareBytes, type GrammarFeatures } from "@gramin/core";

export interface NamedFeatures {
  readonly name: string;
  readonly features: GrammarFeatures;
}

const cell = (value: unknown): string => {
  let text =
    value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : (JSON.stringify(value) ?? String(value));
  if (typeof value === "string" && /^\s*[=+@-]/u.test(text)) text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const renderFeatureCsv = (documents: readonly NamedFeatures[]): string => {
  const rows: unknown[][] = [["grammar", "scope", "rule", "metric", "value", "notApplicable"]];
  for (const { name, features } of [...documents].sort((a, b) => compareBytes(a.name, b.name))) {
    const visit = (value: unknown, path: string, scope: string, rule: string): void => {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Readonly<Record<string, unknown>>;
        for (const key of Object.keys(record).sort(compareBytes)) {
          const childPath = path ? `${path}.${key}` : key;
          if (key === "notApplicable") {
            const reasons = record[key];
            if (reasons !== null && typeof reasons === "object") {
              for (const [metric, reason] of Object.entries(reasons).sort(([a], [b]) =>
                compareBytes(a, b),
              )) {
                rows.push([
                  name,
                  scope,
                  rule,
                  path ? `${path}.${metric}` : metric,
                  undefined,
                  reason,
                ]);
              }
            }
          } else visit(record[key], childPath, scope, rule);
        }
      } else if (value !== undefined) {
        rows.push([name, scope, rule, path, value, undefined]);
      }
    };
    const { perRule, ...aggregate } = features;
    visit(aggregate, "", "grammar", "");
    for (const { rule, ...metrics } of [...perRule].sort((a, b) => compareBytes(a.rule, b.rule))) {
      visit(metrics, "", "rule", rule);
    }
  }
  return `${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
};
