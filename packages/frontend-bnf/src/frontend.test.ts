import { readFileSync } from "node:fs";
import { serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { bnfFrontend } from "./frontend.js";

const content = readFileSync(new URL("../fixtures/arithmetic.ebnf", import.meta.url), "utf8");

describe("BNF frontend", () => {
  it("lowers BNF and EBNF notation to canonical IR", () => {
    const result = bnfFrontend.parse([{ name: "arithmetic.ebnf", content }], {});
    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.ir?.capabilities.ebnfSugar).toBe(true);
    expect(result.ir?.rules.map(({ name }) => name)).toEqual(["expr", "term", "factor"]);
  });

  it("preserves sugar and nested choices for the analyzer", () => {
    const result = bnfFrontend.parse([{ name: "arithmetic.ebnf", content }], {});
    const repetition = result.ir?.rules[0]?.alternatives[0]?.items[1];
    expect(repetition?.kind).toBe("star");
    if (repetition?.kind !== "star" || repetition.expr.kind !== "seq") {
      throw new Error("expected a repeated sequence");
    }
    expect(repetition.expr.items[0]).toMatchObject({
      kind: "group",
      expr: { kind: "choice", ordered: false },
    });
  });

  it("matches location and stripped-location goldens", () => {
    const result = bnfFrontend.parse([{ name: "arithmetic.ebnf", content }], {});
    expect(serializeCanonical(result.ir, { stripLocations: true })).toBe(
      readFileSync(new URL("../fixtures/golden/arithmetic.ir.json", import.meta.url), "utf8"),
    );
    expect(serializeCanonical(result.ir)).toBe(
      readFileSync(new URL("../fixtures/golden/arithmetic.ir-loc.json", import.meta.url), "utf8"),
    );
  });

  it("reports excessive nesting without overflowing the call stack", () => {
    const depth = 20;
    const result = bnfFrontend.parse(
      [{ name: "deep.ebnf", content: `start = ${"(".repeat(depth)}"x"${")".repeat(depth)};` }],
      { maxNestingDepth: 5 },
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "BNF103_NESTING_TOO_DEEP", severity: "error" }),
    );
    expect(result.ir).toBeNull();
  });
});
