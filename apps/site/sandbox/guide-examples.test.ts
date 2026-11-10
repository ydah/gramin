import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeRequest } from "./pipeline";

const example = (name: string) => {
  const path = new URL(`../../../examples/grammar-guide/${name}`, import.meta.url);
  expect(existsSync(path), `documented grammar ${name}`).toBe(true);
  return { name, content: readFileSync(path, "utf8") };
};

describe("documented grammar examples", () => {
  it("compares Peggy source counts while preserving ordered-choice applicability reasons", () => {
    const response = analyzeRequest({
      mode: "compare",
      files: [],
      beforeFiles: [example("choice-before.peggy")],
      afterFiles: [example("choice-after.peggy")],
      frontendId: "peggy",
      budgetChars: 6000,
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const comparison = response.comparison;
    expect(comparison).toBeDefined();
    if (!comparison) return;

    expect(comparison.before.features.size).toMatchObject({
      rules: 1,
      alternatives: 2,
      terminals: 2,
    });
    expect(comparison.after.features.size).toMatchObject({
      rules: 1,
      alternatives: 3,
      terminals: 3,
    });
    expect(comparison.diff.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/size/alternatives", before: 2, after: 3 }),
        expect.objectContaining({ path: "/size/terminals", before: 2, after: 3 }),
        expect.objectContaining({ path: "/perRule/start/alternatives", before: 2, after: 3 }),
      ]),
    );
    for (const measured of [comparison.before, comparison.after]) {
      expect(measured.ir.capabilities.orderedChoice).toBe(true);
      for (const metric of ["firstSetSize", "followSetSize", "ll1Conflicts", "slr"] as const) {
        expect(measured.features.parseability[metric]).toBeUndefined();
        expect(measured.features.parseability.notApplicable?.[metric]).toBe(
          "orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply",
        );
      }
    }
    expect(
      comparison.diff.changes.filter((change) => change.path.startsWith("/parseability/")),
    ).toEqual([]);
    expect(structuredClone(response)).toEqual(response);
  });

  it("measures an epsilon rule as productive with a zero-length shortest derivation", () => {
    const response = analyzeRequest({
      mode: "source",
      files: [example("epsilon.bnf")],
      frontendId: "bnf",
      budgetChars: 6000,
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.features.structure).toMatchObject({
      nullableRules: 1,
      unproductiveSymbols: [],
      shortestDerivation: [{ rule: "start", length: 0 }],
      shortestDerivationUnknown: [],
    });
    expect(response.features.perRule).toContainEqual(
      expect.objectContaining({ rule: "start", rhsItems: 0, shortestDerivation: 0 }),
    );
    expect(response.features.diagnostics).toEqual([]);
  });

  it("omits a finite shortest derivation for an unproductive self-reference", () => {
    const response = analyzeRequest({
      mode: "source",
      files: [example("unproductive.bnf")],
      frontendId: "bnf",
      budgetChars: 6000,
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.features.structure).toMatchObject({
      nullableRules: 0,
      unproductiveSymbols: ["start"],
      shortestDerivation: [],
      shortestDerivationUnknown: ["start"],
    });
    expect(
      response.features.perRule?.find((rule) => rule.rule === "start")?.shortestDerivation,
    ).toBeUndefined();
    expect(response.features.structure.notApplicable?.shortestDerivation).toBeUndefined();
    expect(response.features.diagnostics).toEqual([
      expect.objectContaining({ code: "ANALYZER006_UNPRODUCTIVE_RULES", severity: "warning" }),
      expect.objectContaining({ code: "ANALYZER007_CYCLIC_UNIT_RULES", severity: "error" }),
    ]);
  });
});
