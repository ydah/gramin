import { describe, expect, it } from "vitest";
import { MAX_BROWSER_INPUT_CHARS } from "./limits";
import { analyzeRequest } from "./pipeline";
import { defaultSample, sandboxSamples } from "./samples";

describe("browser sandbox pipeline", () => {
  it.each(sandboxSamples)("analyzes the $label sample", (sample) => {
    const response = analyzeRequest({
      mode: "source",
      files: sample.files,
      frontendId: sample.frontendId,
      budgetChars: 6000,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.frontend.id).toBe(sample.frontendId);
    expect(response.reports.json).toContain('"featuresVersion"');
    expect(response.reports.markdown).toContain("# Grammar feature report");
    expect(response.reports.llm.length).toBeLessThanOrEqual(6000);
    expect(response.reports.sarif).toContain('"version": "2.1.0"');
  });

  it("round-trips canonical IR through the IR mode", () => {
    const sourceResponse = analyzeRequest({
      mode: "source",
      files: defaultSample?.files ?? [],
      frontendId: defaultSample?.frontendId ?? "yacc-family",
      budgetChars: 6000,
    });

    expect(sourceResponse.ok).toBe(true);
    if (!sourceResponse.ok) return;

    const irResponse = analyzeRequest({
      mode: "ir",
      files: [{ name: "grammar-ir.json", content: sourceResponse.reports.ir }],
      frontendId: "auto",
      budgetChars: 6000,
    });

    expect(irResponse.ok).toBe(true);
    if (!irResponse.ok) return;
    expect(irResponse.reports.json).toBe(sourceResponse.reports.json);
  });

  it("reports a before/after feature diff", () => {
    const before = defaultSample?.files[0];
    if (!before) throw new Error("default sandbox sample is missing");
    const after = { ...before, content: `${before.content}\nextra : STRING ;\n` };

    const response = analyzeRequest({
      mode: "compare",
      files: [],
      beforeFiles: [before],
      afterFiles: [after],
      frontendId: "yacc-family",
      budgetChars: 6000,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.comparison?.diff.changes.length).toBeGreaterThan(0);
    expect(response.comparison?.reports.markdown).toContain("# Grammar feature diff");
  });

  it("rejects an ambiguous automatic frontend selection", () => {
    const response = analyzeRequest({
      mode: "source",
      files: [{ name: "grammar.txt", content: 'start = "x";' }],
      frontendId: "auto",
      budgetChars: 6000,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.message).toMatch(/frontend/);
  });

  it("rejects input above the browser safety limit", () => {
    const response = analyzeRequest({
      mode: "source",
      files: [{ name: "grammar.y", content: "x".repeat(MAX_BROWSER_INPUT_CHARS + 1) }],
      frontendId: "yacc-family",
      budgetChars: 6000,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.message).toContain("250,000");
  });
});
