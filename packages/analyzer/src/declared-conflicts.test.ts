import { readFileSync } from "node:fs";
import { validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { analyzeGrammar } from "./analyze.js";

const fixture: unknown = JSON.parse(
  readFileSync(
    new URL("../../frontend-yacc/fixtures/golden/calc.ir.json", import.meta.url),
    "utf8",
  ),
);
const validated = validateIR(fixture);
if (!validated.ok) throw new Error("invalid IR fixture");

describe("declared conflict source features", () => {
  it.each([false, true])("copies explicit declarations independently of LR mode %s", (lr) => {
    const ir = { ...validated.value, expectedConflicts: { shiftReduce: 0, reduceReduce: 2 } };
    const result = analyzeGrammar(ir, { lr });
    expect(result.parseability.declaredConflicts).toEqual({ shiftReduce: 0, reduceReduce: 2 });
    expect(result.parseability.notApplicable?.declaredConflicts).toBeUndefined();
  });

  it("preserves declarations when SLR is unavailable", () => {
    const ir = {
      ...validated.value,
      capabilities: { ...validated.value.capabilities, orderedChoice: true },
      expectedConflicts: { shiftReduce: 0 },
    };
    const result = analyzeGrammar(ir, { lr: true });
    expect(result.parseability.declaredConflicts).toEqual({ shiftReduce: 0 });
    expect(result.parseability.slr).toBeUndefined();
    expect(result.parseability.notApplicable?.slr).toBeTruthy();
    expect(result.parseability.notApplicable?.declaredConflicts).toBeUndefined();
  });

  it("explains absent declarations without supplying zero or losing other reasons", () => {
    const result = analyzeGrammar(validated.value);
    expect(result.parseability.declaredConflicts).toBeUndefined();
    expect(result.parseability.notApplicable?.declaredConflicts).toBe(
      "no valid global conflict expectation declaration was captured",
    );
    expect(result.parseability.notApplicable?.slr).toBeTruthy();
  });
});
