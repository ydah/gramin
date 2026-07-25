import { readFileSync } from "node:fs";
import { type GrammarIR, serializeCanonical } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { analyzeGrammar } from "./analyze.js";

const goldenCases = [
  "calc",
  "empty",
  "indirect-recursion",
  "alias",
  "precedence-override",
] as const;

describe("IR to features golden files", () => {
  it.each(goldenCases)("matches %s.features.json", (name) => {
    const directory = new URL("../../frontend-yacc/fixtures/golden/", import.meta.url);
    const ir = JSON.parse(readFileSync(new URL(`${name}.ir.json`, directory), "utf8")) as GrammarIR;
    const expected = readFileSync(new URL(`${name}.features.json`, directory), "utf8");
    expect(serializeCanonical(analyzeGrammar(ir), { stripLocations: true })).toBe(expected);

    const irWithLocations = JSON.parse(
      readFileSync(new URL(`${name}.ir-loc.json`, directory), "utf8"),
    ) as GrammarIR;
    const expectedWithLocations = readFileSync(
      new URL(`${name}.features-loc.json`, directory),
      "utf8",
    );
    expect(serializeCanonical(analyzeGrammar(irWithLocations))).toBe(expectedWithLocations);
  });
});
