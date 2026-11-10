import { compareBytes, type GrammarFeatures } from "@gramin/core";

export const ruleMetrics = [
  ["alternatives", "Alternatives"],
  ["rhsItems", "Right-hand-side items"],
  ["maxRhsItems", "Longest right-hand side"],
  ["fanIn", "Fan-in"],
  ["fanOut", "Fan-out"],
  ["firstSetSize", "FIRST set size"],
  ["followSetSize", "FOLLOW set size"],
  ["slrConflictInvolvement", "Raw SLR conflict involvement"],
] as const;
export type RuleMetric = (typeof ruleMetrics)[number][0];

interface ChartRow {
  readonly label: string;
  readonly value?: number;
  readonly reason?: string;
}

interface FeatureChart {
  readonly title: string;
  readonly description: string;
  readonly rows: readonly ChartRow[];
}

export const featureCharts = (features: GrammarFeatures): readonly FeatureChart[] => {
  const percentileRows = (key: "altPerRulePercentiles" | "rhsLengthPercentiles"): ChartRow[] =>
    (["p50", "p95"] as const).map((label) => {
      const value = features.size[key]?.[label];
      return value === undefined
        ? { label, reason: features.size.notApplicable?.[key] ?? "No percentiles were recorded." }
        : { label, value };
    });
  return [
    {
      title: "Alternatives per rule",
      description: "Percentiles across source rules.",
      rows: percentileRows("altPerRulePercentiles"),
    },
    {
      title: "Right-hand-side length",
      description: "Percentiles across source alternatives.",
      rows: percentileRows("rhsLengthPercentiles"),
    },
    {
      title: "Component sizes",
      description: "Recorded maxima in the source dependency graph.",
      rows: [
        { label: "Largest SCC", value: features.structure.largestSccSize.value },
        {
          label: "Largest recursive component",
          value: features.structure.largestRecursiveComponent.value,
        },
      ],
    },
  ];
};

export const ruleChartData = (features: GrammarFeatures, metric: RuleMetric, query: string) => {
  const reasonKey = metric === "slrConflictInvolvement" ? "slr" : metric;
  const rows = features.perRule
    .filter(({ rule }) => rule.includes(query))
    .map((row) => {
      const value = row[metric];
      const unavailable = features.parseability.context?.omittedTemplateRules.includes(row.rule)
        ? "Template rule; concrete instances are measured separately."
        : "No value was recorded for this source rule.";
      return value === undefined
        ? {
            rule: row.rule,
            reason: features.parseability.notApplicable?.[reasonKey] ?? unavailable,
          }
        : { rule: row.rule, value };
    })
    .sort(
      (left, right) =>
        (right.value ?? -1) - (left.value ?? -1) || compareBytes(left.rule, right.rule),
    );
  return { total: rows.length, maximum: rows[0]?.value ?? 0, rows: rows.slice(0, 20) };
};
