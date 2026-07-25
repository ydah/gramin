import { readFileSync } from "node:fs";
import { type GrammarIR, serializeCanonical } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { analyzeGrammar, UnsupportedIRVersionError } from "./analyze.js";

const fixtureIR = (name: string): GrammarIR =>
  JSON.parse(
    readFileSync(
      new URL(`../../frontend-yacc/fixtures/golden/${name}.ir.json`, import.meta.url),
      "utf8",
    ),
  ) as GrammarIR;

describe("analyzeGrammar", () => {
  it("matches hand-calculated calculator metrics", () => {
    const features = analyzeGrammar(fixtureIR("calc"));
    expect(features.size).toMatchObject({
      terminals: 6,
      nonterminals: 2,
      rules: 2,
      alternatives: 7,
      avgAltPerRule: 3.5,
      avgRhsLength: 2,
      maxAltPerRule: { value: 5, rule: "expr" },
      maxRhsLength: { value: 3, rule: "expr" },
      emptyAlternatives: 1,
    });
    expect(features.precedence).toMatchObject({
      levels: 2,
      assocBreakdown: { left: 1, right: 1, nonassoc: 0, precedence: 0 },
      precOverrides: 1,
      tokensInPrecedence: { count: 3, ratio: 0.5 },
    });
    expect(features.actions).toEqual({
      altActionCoverage: 0.1429,
      midRuleActions: 1,
      avgActionLength: 15,
      maxActionLength: 15,
    });
  });

  it("finds mutual recursion, dependency depth, and nullability", () => {
    const features = analyzeGrammar(fixtureIR("indirect-recursion"));
    expect(features.structure).toMatchObject({
      recursionSccCount: 1,
      largestSccSize: { value: 2, members: ["first", "second"] },
      maxDependencyDepth: 1,
      nullableRules: 2,
    });
  });

  it("uses byte-order tie breaking for rankings", () => {
    const ir = fixtureIR("empty");
    const features = analyzeGrammar(ir);
    const counts = features.structure.topFanIn.map(({ symbol, count }) => [symbol, count]);
    expect(counts).toEqual([
      ["items", 1],
      ["optional", 0],
    ]);
  });

  it("omits CFG nullability for ordered choice with a reason", () => {
    const ir: GrammarIR = {
      ...fixtureIR("empty"),
      source: {
        format: "peg",
        frontend: { id: "test", version: "0.1.0" },
      },
      capabilities: {
        ...fixtureIR("empty").capabilities,
        orderedChoice: true,
        precedenceTable: false,
      },
      rules: [
        {
          name: "start",
          alternatives: [
            {
              items: [
                {
                  kind: "opt",
                  expr: {
                    kind: "choice",
                    ordered: true,
                    alts: [{ kind: "terminal", literal: "x" }],
                  },
                },
              ],
            },
          ],
        },
      ],
      startSymbols: ["start"],
      precedence: [],
    };
    const features = analyzeGrammar(ir);
    expect(features.structure.nullableRules).toBeUndefined();
    expect(features.structure.notApplicable?.nullableRules).toContain("orderedChoice");
  });

  it("serializes deterministically", () => {
    const ir = fixtureIR("calc");
    expect(serializeCanonical(analyzeGrammar(ir))).toBe(serializeCanonical(analyzeGrammar(ir)));
  });

  it("supports v0 during migration and rejects unknown major versions", () => {
    const legacy = { ...fixtureIR("calc"), irVersion: "0.2.0" };
    expect(analyzeGrammar(legacy).diagnostics).toContainEqual(
      expect.objectContaining({ code: "ANALYZER005_LEGACY_IR_VERSION" }),
    );
    expect(() => analyzeGrammar({ ...legacy, irVersion: "2.0.0" })).toThrow(
      UnsupportedIRVersionError,
    );
  });

  it("warns when analyzing a future compatible v1 minor", () => {
    const future = { ...fixtureIR("calc"), irVersion: "1.3.0" };
    expect(analyzeGrammar(future).diagnostics).toContainEqual(
      expect.objectContaining({ code: "ANALYZER004_FUTURE_IR_MINOR" }),
    );
  });
});
