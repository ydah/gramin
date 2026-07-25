import { readFileSync } from "node:fs";
import { serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { analyzeGrammar } from "./analyze.js";

const goldenCases = [
  "calc",
  "empty",
  "indirect-recursion",
  "alias",
  "precedence-override",
  "lrama",
  "json",
] as const;

describe("IR to features golden files", () => {
  it.each(goldenCases)("matches %s.features.json", (name) => {
    const directory = new URL("../../frontend-yacc/fixtures/golden/", import.meta.url);
    const parsedIR = validateIR(
      JSON.parse(readFileSync(new URL(`${name}.ir.json`, directory), "utf8")) as unknown,
    );
    if (!parsedIR.ok) throw new Error(`invalid ${name}.ir.json golden`);
    const expected = readFileSync(new URL(`${name}.features.json`, directory), "utf8");
    expect(serializeCanonical(analyzeGrammar(parsedIR.value), { stripLocations: true })).toBe(
      expected,
    );

    const parsedIRWithLocations = validateIR(
      JSON.parse(readFileSync(new URL(`${name}.ir-loc.json`, directory), "utf8")) as unknown,
    );
    if (!parsedIRWithLocations.ok) throw new Error(`invalid ${name}.ir-loc.json golden`);
    const expectedWithLocations = readFileSync(
      new URL(`${name}.features-loc.json`, directory),
      "utf8",
    );
    expect(serializeCanonical(analyzeGrammar(parsedIRWithLocations.value))).toBe(
      expectedWithLocations,
    );
  });
});
