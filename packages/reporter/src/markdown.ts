import type { GrammarFeatures } from "@gramin/core";

const sectionTitles: Readonly<Record<string, string>> = {
  source: "Source",
  capabilities: "Capabilities",
  size: "Size",
  structure: "Structure",
  precedence: "Precedence",
  lexicon: "Lexicon",
  sugar: "Sugar and extensions",
  actions: "Actions",
  notable: "Notable grammar locations",
  diagnostics: "Diagnostics",
};

const heuristicMetrics = new Set(["lexicon.keywordLike", "lexicon.punctuationLike"]);

const escapeCell = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\n", "\\n");

const renderValue = (value: unknown): string => {
  if (value === null) return "`null`";
  if (typeof value === "string") return `\`${escapeCell(value)}\``;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `\`${escapeCell(JSON.stringify(value))}\``;
};

const flatten = (
  value: unknown,
  prefix = "",
): readonly { readonly name: string; readonly value: unknown }[] => {
  if (Array.isArray(value)) return [{ name: prefix, value }];
  if (value === null || typeof value !== "object") return [{ name: prefix, value }];
  return Object.entries(value).flatMap(([key, entry]) =>
    flatten(entry, prefix ? `${prefix}.${key}` : key),
  );
};

const renderSection = (key: string, value: unknown): string => {
  const rows = flatten(value);
  const body =
    rows.length === 0
      ? "| — | — |\n"
      : rows
          .map(({ name, value: metricValue }) => {
            const fullName = `${key}.${name}`;
            const label = heuristicMetrics.has(fullName) ? `${name} (approximate)` : name;
            return `| \`${escapeCell(label)}\` | ${renderValue(metricValue)} |`;
          })
          .join("\n");
  return `## ${sectionTitles[key] ?? key}\n\n| Metric | Value |\n|---|---:|\n${body}`;
};

export const renderMarkdown = (features: GrammarFeatures): string => {
  const sections = Object.entries(features)
    .filter(([key]) => key !== "featuresVersion")
    .map(([key, value]) => {
      if (key !== "actions" || features.actions.completeness !== "partial") {
        return renderSection(key, value);
      }
      return renderSection(key, {
        completeness: features.actions.completeness,
        notApplicable: features.actions.notApplicable,
      });
    })
    .join("\n\n");
  return `# Grammar feature report\n\nFeatures version: \`${features.featuresVersion}\`\n\n${sections}\n`;
};
