import { readFileSync } from "node:fs";
import { type GrammarIR, serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { analyzeGrammar, UnsupportedIRVersionError } from "./analyze.js";

const fixtureIR = (name: string): GrammarIR => {
  const result = validateIR(
    JSON.parse(
      readFileSync(
        new URL(`../../frontend-yacc/fixtures/golden/${name}.ir.json`, import.meta.url),
        "utf8",
      ),
    ) as unknown,
  );
  if (!result.ok) throw new Error(`invalid ${name}.ir.json fixture`);
  return result.value;
};

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
      altPerRulePercentiles: { p50: 2, p95: 5 },
      rhsLengthPercentiles: { p50: 2, p95: 3 },
    });
    expect(features.capabilities).toEqual(fixtureIR("calc").capabilities);
    expect(features.structure).toMatchObject({
      reachableRules: 2,
      recursiveRules: { count: 2, ratio: 1 },
      largestRecursiveComponent: { value: 1, ratio: 0.5, members: ["expr"] },
    });
    expect(features.precedence).toMatchObject({
      levels: 2,
      assocBreakdown: { left: 1, right: 1, nonassoc: 0, precedence: 0 },
      precOverrides: 1,
      maxTokensPerLevel: 2,
      rulesWithPrecOverrides: 1,
      precOverrideAlternativeRatio: 0.1429,
      tokensInPrecedence: { count: 3, ratio: 0.5 },
    });
    expect(features.actions).toEqual({
      completeness: "complete",
      altActionCoverage: 0.1429,
      midRuleActions: 1,
      avgActionLength: 15,
      maxActionLength: 15,
      trailingActions: 1,
      totalActions: 2,
      rulesWithActions: 1,
    });
  });

  it("finds mutual recursion, dependency depth, and nullability", () => {
    const features = analyzeGrammar(fixtureIR("indirect-recursion"));
    expect(features.structure).toMatchObject({
      recursionSccCount: 1,
      largestSccSize: { value: 2, members: ["first", "second"] },
      reachableRules: 3,
      recursiveRules: { count: 2, ratio: 0.6667 },
      largestRecursiveComponent: {
        value: 2,
        ratio: 0.6667,
        members: ["first", "second"],
      },
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

  it("marks empty-sample ratios and percentiles as not applicable", () => {
    const ir: GrammarIR = {
      ...fixtureIR("calc"),
      capabilities: {
        ...fixtureIR("calc").capabilities,
        precedenceTable: false,
      },
      startSymbols: [],
      terminals: [],
      precedence: [],
      rules: [],
    };
    const features = analyzeGrammar(ir);
    expect(features.size.altPerRulePercentiles).toBeUndefined();
    expect(features.size.rhsLengthPercentiles).toBeUndefined();
    expect(features.size.notApplicable).toEqual({
      altPerRulePercentiles: "grammar has no rules",
      rhsLengthPercentiles: "grammar has no alternatives",
    });
    expect(features.structure).toMatchObject({
      reachableRules: 0,
      recursiveRules: { count: 0 },
      largestRecursiveComponent: { value: 0, members: [] },
    });
    expect(features.structure.recursiveRules.ratio).toBeUndefined();
    expect(features.structure.largestRecursiveComponent.ratio).toBeUndefined();
  });

  it("marks action measurements partial when a frontend reports omitted actions", () => {
    const ir: GrammarIR = {
      ...fixtureIR("calc"),
      diagnostics: [
        {
          severity: "info",
          code: "IR010_LOSSY_ACTION",
          message: "action omitted",
        },
      ],
    };
    const actions = analyzeGrammar(ir).actions;
    expect(actions.completeness).toBe("partial");
    expect(actions.trailingActions).toBeUndefined();
    expect(actions.totalActions).toBeUndefined();
    expect(actions.rulesWithActions).toBeUndefined();
    expect(actions.notApplicable?.totalActions).toContain("omitted");
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
