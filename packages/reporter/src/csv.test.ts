import { readFileSync } from "node:fs";
import { validateFeatures } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { renderFeatureCsv } from "./csv.js";

const features = () => {
  const parsed = validateFeatures(
    JSON.parse(
      readFileSync(
        new URL("../../frontend-yacc/fixtures/golden/calc.features.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  if (!parsed.ok || !parsed.value.perRule[0]) throw new Error("invalid fixture");
  return {
    ...parsed.value,
    size: { ...parsed.value.size, rules: 1 },
    perRule: [{ ...parsed.value.perRule[0], rule: "s", fanIn: 0 }],
  };
};

describe("feature CSV", () => {
  it("exports aggregate and rule vectors with unavailable values separate from zero", () => {
    const report = renderFeatureCsv([{ name: "sample", features: features() }]);
    expect(report.startsWith("grammar,scope,rule,metric,value,notApplicable\r\n")).toBe(true);
    expect(report).toContain("sample,grammar,,size.rules,1,\r\n");
    expect(report).toContain("sample,rule,s,fanIn,0,\r\n");
    expect(report).toContain("sample,grammar,,parseability.slr,,requires --analysis lr\r\n");
    expect(report).not.toContain("sample,rule,s,slrConflictInvolvement,0");
  });

  it("quotes delimiters/newlines and neutralizes spreadsheet formulas in untrusted text", () => {
    const report = renderFeatureCsv([{ name: '=SUM(1,2)\n"x"', features: features() }]);
    expect(report).toContain('"\'=SUM(1,2)\n""x""",grammar,,size.rules,1,\r\n');
  });

  it("orders grammars and metric paths deterministically", () => {
    const a = { name: "a", features: features() };
    const z = { name: "z", features: features() };
    expect(renderFeatureCsv([a, z])).toBe(renderFeatureCsv([z, a]));
    expect(renderFeatureCsv([])).toBe("grammar,scope,rule,metric,value,notApplicable\r\n");
  });
});
