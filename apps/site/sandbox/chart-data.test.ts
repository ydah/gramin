import type { GrammarFeatures } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { featureCharts, ruleChartData } from "./chart-data";
import { analyzeRequest } from "./pipeline";

const fixture = (): GrammarFeatures => {
  const result = analyzeRequest({
    mode: "source",
    files: [{ name: "recursive.bnf", content: 's ::= a | "x"; a ::= s;' }],
    frontendId: "bnf",
    budgetChars: 6000,
  });
  if (!result.ok) throw new Error(result.message);
  return result.features;
};

describe("sandbox chart data", () => {
  it("uses recorded percentiles and precisely labeled component measurements", () => {
    const charts = featureCharts(fixture());
    expect(charts[0]?.rows).toEqual([
      { label: "p50", value: 1 },
      { label: "p95", value: 2 },
    ]);
    expect(charts[1]?.rows).toEqual([
      { label: "p50", value: 1 },
      { label: "p95", value: 1 },
    ]);
    expect(charts[2]?.rows).toEqual([
      { label: "Largest mutual SCC", value: 2 },
      { label: "Largest recursive component", value: 2 },
    ]);
  });

  it("distinguishes omitted measurements from measured zero", () => {
    const features = fixture();
    const data = ruleChartData(features, "slrConflictInvolvement", "");
    expect(data.rows).toHaveLength(2);
    expect(data.rows.every((row) => row.value === undefined)).toBe(true);
    expect(data.rows.every((row) => row.reason?.includes("requires --analysis lr"))).toBe(true);
    expect(ruleChartData(features, "fanIn", "s").rows).toEqual([{ rule: "s", value: 1 }]);
    const { altPerRulePercentiles, ...size } = features.size;
    expect(altPerRulePercentiles).toBeDefined();
    const noPercentiles = { ...features, size };
    expect(featureCharts(noPercentiles)[0]?.rows.every((row) => row.value === undefined)).toBe(
      true,
    );
    const zero = { ...features, perRule: features.perRule.map((row) => ({ ...row, fanIn: 0 })) };
    expect(ruleChartData(zero, "fanIn", "s").rows).toEqual([{ rule: "s", value: 0 }]);
  });

  it("charts actual SCC frequencies and distinguishes empty from unrecorded populations", () => {
    const features = fixture();
    const histogram = [
      { size: 1, count: 3 },
      { size: 2, count: 1 },
    ];
    const chart = featureCharts({
      ...features,
      structure: { ...features.structure, sccSizeHistogram: histogram },
    }).find(({ title }) => title === "SCC size distribution");
    expect(chart?.rows).toEqual([
      { label: "1 rule", value: 3 },
      { label: "2 rules", value: 1 },
    ]);
    expect(
      featureCharts({
        ...features,
        structure: { ...features.structure, sccSizeHistogram: [] },
      }).find(({ title }) => title === "SCC size distribution")?.rows,
    ).toEqual([{ label: "Components", value: 0 }]);
    const structure = { ...features.structure };
    delete structure.sccSizeHistogram;
    expect(
      featureCharts({ ...features, structure }).find(
        ({ title }) => title === "SCC size distribution",
      )?.rows,
    ).toEqual([{ label: "Components", reason: "No SCC size histogram was recorded." }]);
  });

  it("filters rule names and bounds chart rows without dropping data from Features", () => {
    const features = fixture();
    const first = features.perRule[0];
    if (!first) throw new Error("missing fixture row");
    const many = {
      ...features,
      perRule: Array.from({ length: 30 }, (_, index) => ({
        ...first,
        rule: `rule-${index.toString().padStart(2, "0")}`,
        alternatives: index,
      })),
    };
    const chart = ruleChartData(many, "alternatives", "rule-");
    expect(chart.total).toBe(30);
    expect(chart.rows).toHaveLength(20);
    expect(chart.rows[0]).toEqual({ rule: "rule-29", value: 29 });
    expect(many.perRule).toHaveLength(30);
    expect(ruleChartData(many, "alternatives", "missing").rows).toEqual([]);
  });
});
