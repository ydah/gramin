import { readFileSync } from "node:fs";
import { type GrammarIR, serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { analyzeGrammar, UnsupportedIRVersionError } from "./analyze.js";

const LONG_CHAIN_TEST_TIMEOUT_MS = 15_000;

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

  it("computes CFG parseability and refactoring candidates", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      startSymbols: ["start"],
      terminals: [{ name: "A" }, { name: "B" }, { name: "UNUSED" }],
      precedence: [{ assoc: "left", tokens: ["A", "STALE"] }],
      capabilities: { ...base.capabilities, precedenceTable: true },
      rules: [
        {
          name: "start",
          alternatives: [
            {
              items: [
                { kind: "terminal", name: "A" },
                { kind: "symbol", name: "tail" },
              ],
            },
            {
              items: [
                { kind: "terminal", name: "A" },
                { kind: "terminal", name: "B" },
              ],
            },
            { items: [{ kind: "symbol", name: "empty" }] },
          ],
        },
        { name: "tail", alternatives: [{ items: [{ kind: "terminal", name: "B" }] }] },
        { name: "empty", alternatives: [{ items: [] }] },
      ],
    });
    expect(features.parseability).toMatchObject({
      firstSetSize: { average: 0.6667, maximum: { value: 1, rule: "start" } },
      ll1Conflicts: { firstFirst: 1, firstFollow: 0, total: 1 },
      unitRules: 1,
      cyclicUnitRules: [],
    });
    expect(features.redundancy).toMatchObject({
      commonPrefixPairs: 1,
      maxCommonPrefixLength: 1,
      singleReferenceRules: ["empty", "tail"],
      unusedTerminals: ["UNUSED"],
      unusedPrecedenceTokens: ["STALE"],
    });
    expect(features.perRule.find(({ rule }) => rule === "start")).toMatchObject({
      firstSetSize: 1,
      followSetSize: 1,
      ll1Conflicts: { firstFirst: 1, firstFollow: 0, total: 1 },
      unitRules: 1,
    });
  });

  it("recognizes list recursion without classifying every recursive expression rule", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      startSymbols: ["items"],
      rules: [
        {
          name: "items",
          alternatives: [
            { items: [{ kind: "symbol", name: "item" }] },
            {
              items: [
                { kind: "symbol", name: "items" },
                { kind: "symbol", name: "item" },
              ],
            },
          ],
        },
        {
          name: "expr",
          alternatives: [
            { items: [{ kind: "symbol", name: "term" }] },
            {
              items: [
                { kind: "symbol", name: "expr" },
                { kind: "terminal", literal: "+" },
                { kind: "symbol", name: "term" },
              ],
            },
          ],
        },
        { name: "item", alternatives: [{ items: [{ kind: "terminal", literal: "i" }] }] },
        { name: "term", alternatives: [{ items: [{ kind: "terminal", literal: "n" }] }] },
      ],
    });

    expect(features.redundancy.listRecursion).toEqual({
      left: 1,
      right: 0,
      mixed: 0,
      consistency: 1,
    });
  });

  it("diagnoses cycles made only of unit rules", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      startSymbols: ["a"],
      terminals: [],
      rules: [
        { name: "a", alternatives: [{ items: [{ kind: "symbol", name: "b" }] }] },
        { name: "b", alternatives: [{ items: [{ kind: "symbol", name: "a" }] }] },
      ],
    });
    expect(features.parseability.cyclicUnitRules).toEqual([["a", "b"]]);
    expect(features.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ANALYZER007_CYCLIC_UNIT_RULES", severity: "error" }),
    );
  });

  it("computes advanced graph shape and shortest derivations", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      startSymbols: ["a"],
      terminals: [{ name: "END" }],
      rules: [
        { name: "a", alternatives: [{ items: [{ kind: "symbol", name: "b" }] }] },
        { name: "b", alternatives: [{ items: [{ kind: "symbol", name: "c" }] }] },
        { name: "c", alternatives: [{ items: [{ kind: "terminal", name: "END" }] }] },
      ],
    });
    expect(features.structure).toMatchObject({
      articulationPoints: ["b"],
      bridges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
      shortestDerivation: [
        { rule: "a", length: 1 },
        { rule: "b", length: 1 },
        { rule: "c", length: 1 },
      ],
      startSymbolReachability: {
        entries: [{ symbol: "a", reachableRules: 3, rules: ["a", "b", "c"] }],
        overlapRatio: 1,
      },
      maxExpressionNestingDepth: 1,
    });
    expect(features.structure.topBetweenness[0]).toEqual({ symbol: "b", value: 1 });
    expect(features.perRule.find(({ rule }) => rule === "b")).toMatchObject({
      fanIn: 1,
      fanOut: 1,
      maxRhsItems: 1,
      maxExpressionNestingDepth: 1,
      references: ["c"],
      referencedBy: ["a"],
      reachableFromStarts: ["a"],
      shortestDerivation: 1,
    });
  });

  it("runs opt-in SLR analysis", () => {
    const base = fixtureIR("empty");
    const ir: GrammarIR = {
      ...base,
      startSymbols: ["start"],
      terminals: [{ name: "A" }],
      rules: [{ name: "start", alternatives: [{ items: [{ kind: "terminal", name: "A" }] }] }],
    };
    expect(analyzeGrammar(ir).parseability.slr).toBeUndefined();
    expect(analyzeGrammar(ir, { lr: true }).parseability.slr).toEqual({
      states: 3,
      shiftReduceConflicts: 0,
      reduceReduceConflicts: 0,
    });
  });

  it("does not report CFG results before parameterized rules are expanded", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar(
      {
        ...base,
        capabilities: { ...base.capabilities, parameterizedRules: true },
        startSymbols: ["start"],
        terminals: [{ name: "A" }],
        rules: [
          {
            name: "start",
            alternatives: [
              {
                items: [
                  {
                    kind: "symbol",
                    name: "wrapper",
                    args: [{ kind: "terminal", name: "A" }],
                  },
                ],
              },
            ],
          },
          {
            name: "wrapper",
            params: ["X"],
            alternatives: [{ items: [{ kind: "symbol", name: "X" }] }],
          },
        ],
      },
      { lr: true },
    );

    expect(features.parseability).toMatchObject({ unitRules: 0, cyclicUnitRules: [] });
    expect(features.parseability.firstSetSize).toBeUndefined();
    expect(features.parseability.ll1Conflicts).toBeUndefined();
    expect(features.parseability.slr).toBeUndefined();
    expect(features.parseability.notApplicable?.slr).toContain("parameterizedRules");
    expect(features.structure.nullableRules).toBeUndefined();
    expect(features.structure.notApplicable?.nullableRules).toContain("parameterizedRules");
    expect(features.structure.unproductiveSymbols).toEqual([]);
    expect(features.structure.shortestDerivation).toEqual([]);
    expect(features.structure.notApplicable?.unproductiveSymbols).toContain("parameterizedRules");
    expect(features.diagnostics.map(({ code }) => code)).not.toContain(
      "ANALYZER006_UNPRODUCTIVE_RULES",
    );
  });

  it("counts the shared FOLLOW set conflict between two nullable alternatives", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      startSymbols: ["start"],
      rules: [{ name: "start", alternatives: [{ items: [] }, { items: [] }] }],
    });

    expect(features.parseability.ll1Conflicts).toEqual({
      firstFirst: 0,
      firstFollow: 1,
      total: 1,
    });
  });

  it("treats an empty literal as an empty derivation", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar(
      {
        ...base,
        startSymbols: ["start"],
        terminals: [{ literal: "" }, { literal: "a" }],
        rules: [
          {
            name: "start",
            alternatives: [{ items: [{ kind: "terminal", literal: "" }] }],
          },
        ],
      },
      { lr: true },
    );

    expect(features.size).toMatchObject({ emptyAlternatives: 1, maxRhsLength: { value: 0 } });
    expect(features.structure).toMatchObject({
      nullableRules: 1,
      shortestDerivation: [{ rule: "start", length: 0 }],
    });
    expect(features.parseability).toMatchObject({
      firstSetSize: { average: 0, maximum: { rule: "start", value: 0 } },
      slr: { states: 2, shiftReduceConflicts: 0, reduceReduceConflicts: 0 },
    });
    expect(features.lexicon.literalPrefixCollisions).toContainEqual({ prefix: "", literal: "a" });
  });

  it("bounds precedence coverage to declared terminals", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      capabilities: { ...base.capabilities, precedenceTable: true },
      terminals: [{ name: "A", literal: "a" }],
      precedence: [{ assoc: "left", tokens: ["A", "a", "STALE"] }],
    });

    expect(features.precedence.tokensInPrecedence).toEqual({ count: 1, ratio: 1 });
  });

  it("finds ordered-choice, recovery, and naming signals", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      capabilities: {
        ...base.capabilities,
        orderedChoice: true,
        predicates: true,
        scannerless: true,
      },
      startSymbols: ["startRule"],
      terminals: [{ name: "error" }, { name: "IDENTIFIER" }],
      rules: [
        {
          name: "startRule",
          orderedAlternatives: true,
          alternatives: [
            { items: [{ kind: "terminal", literal: "a" }] },
            { items: [{ kind: "terminal", literal: "ab" }] },
            {
              items: [
                { kind: "terminal", literal: "x" },
                { kind: "charClass", pattern: "a-z" },
              ],
            },
            {
              items: [
                { kind: "terminal", literal: "x" },
                {
                  kind: "predicate",
                  positive: true,
                  expr: {
                    kind: "predicate",
                    positive: false,
                    expr: { kind: "charClass", pattern: "m-z" },
                  },
                },
              ],
            },
            { items: [{ kind: "terminal", name: "error" }] },
            { items: [{ kind: "symbol", name: "classChoice" }] },
          ],
        },
        {
          name: "classChoice",
          orderedAlternatives: true,
          alternatives: [
            { items: [{ kind: "charClass", pattern: "a-z" }] },
            { items: [{ kind: "charClass", pattern: "m-z" }] },
          ],
        },
      ],
    });
    expect(features.peg).toMatchObject({
      predicates: 2,
      maxPredicateNestingDepth: 2,
      shadowedAlternativePairs: 1,
      charClassOverlapPairs: 1,
    });
    expect(features.peg.backtrackingHotspots?.[0]).toMatchObject({ rule: "startRule" });
    expect(features.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ANALYZER008_SHADOWED_ALTERNATIVES" }),
    );
    expect(features.operations).toMatchObject({
      errorTokenUses: 1,
      rulesWithErrorRecovery: 1,
      recoveryRuleRatio: 0.5,
    });
    expect(features.style).toMatchObject({
      terminalUpperCaseRatio: 0.5,
      nonterminalConvention: "camelCase",
      nonterminalConventionRatio: 1,
    });
  });

  it("reports symbol-expanded PEG shadowing separately as a heuristic", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      capabilities: { ...base.capabilities, orderedChoice: true },
      startSymbols: ["start"],
      rules: [
        {
          name: "start",
          orderedAlternatives: true,
          alternatives: [
            { items: [{ kind: "symbol", name: "short" }] },
            { items: [{ kind: "symbol", name: "long" }] },
          ],
        },
        {
          name: "short",
          orderedAlternatives: true,
          alternatives: [{ items: [{ kind: "terminal", literal: "a" }] }],
        },
        {
          name: "long",
          orderedAlternatives: true,
          alternatives: [{ items: [{ kind: "terminal", literal: "ab" }] }],
        },
      ],
    });

    expect(features.peg).toMatchObject({
      shadowedAlternativePairs: 0,
      potentialShadowedAlternativePairs: 1,
    });
    expect(features.diagnostics.map(({ code }) => code)).not.toContain(
      "ANALYZER008_SHADOWED_ALTERNATIVES",
    );
  });

  it("does not apply CFG productivity diagnostics to ordered choice", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      capabilities: {
        ...base.capabilities,
        orderedChoice: true,
        predicates: true,
      },
      startSymbols: ["start"],
      rules: [
        {
          name: "start",
          orderedAlternatives: true,
          alternatives: [
            {
              items: [
                {
                  kind: "predicate",
                  positive: false,
                  expr: { kind: "symbol", name: "loop" },
                },
              ],
            },
          ],
        },
        {
          name: "loop",
          orderedAlternatives: true,
          alternatives: [{ items: [{ kind: "symbol", name: "loop" }] }],
        },
      ],
    });

    expect(features.structure.unproductiveSymbols).toEqual([]);
    expect(features.structure.shortestDerivation).toEqual([]);
    expect(features.structure.notApplicable?.unproductiveSymbols).toContain("orderedChoice");
    expect(features.diagnostics.map(({ code }) => code)).not.toContain(
      "ANALYZER006_UNPRODUCTIVE_RULES",
    );
  });

  it("does not apply CFG analysis to predicate-bearing grammars", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      capabilities: { ...base.capabilities, predicates: true },
      startSymbols: ["start"],
      rules: [
        {
          name: "start",
          alternatives: [
            {
              items: [
                {
                  kind: "predicate",
                  positive: true,
                  expr: { kind: "terminal", literal: "a" },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(features.parseability.firstSetSize).toBeUndefined();
    expect(features.parseability.notApplicable?.firstSetSize).toContain("predicates");
    expect(features.structure.nullableRules).toBeUndefined();
    expect(features.structure.unproductiveSymbols).toEqual([]);
    expect(features.structure.notApplicable?.shortestDerivation).toContain("predicates");
  });

  it("uses retained source statistics for operational and style metrics", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      sourceMetrics: {
        sourceCharacters: 100,
        comments: { count: 2, characters: 20, documentedRules: ["input"] },
        declarationDirectives: { destructor: 1, printer: 2, union: 1, code: 0 },
        explicitEmptyAlternatives: 1,
        actionReferences: { positional: 3, named: 1 },
      },
      startSymbols: ["input"],
      rules: [
        {
          name: "input",
          alternatives: [{ items: [] }, { items: [{ kind: "symbol", name: "tail" }] }],
        },
        { name: "tail", alternatives: [{ items: [] }] },
      ],
    });

    expect(features.operations).toMatchObject({
      declarationDirectives: { destructor: 1, printer: 2, union: 1, code: 0, total: 4 },
      explicitEmptyAlternatives: { count: 1, emptyAlternatives: 2, ratio: 0.5 },
      actionReferences: { positional: 3, named: 1, total: 4, namedRatio: 0.25 },
    });
    expect(features.style).toMatchObject({
      commentDensity: 0.2,
      comments: 2,
      undocumentedRules: ["tail"],
      documentedRuleRatio: 0.5,
    });
    expect(features.operations.notApplicable).toBeUndefined();
    expect(features.style.notApplicable).toBeUndefined();
  });

  it("does not call unsupported rule names a mixed naming convention", () => {
    const base = fixtureIR("empty");
    const features = analyzeGrammar({
      ...base,
      startSymbols: ["Bad-Name"],
      rules: [{ name: "Bad-Name", alternatives: [{ items: [] }] }],
    });

    expect(features.style).toMatchObject({
      nonterminalConvention: "none",
      nonterminalConventionRatio: 0,
      namingOutliers: ["Bad-Name"],
    });
  });

  it("reports reachable rules that cannot derive a terminal sequence", () => {
    const base = fixtureIR("empty");
    const ir: GrammarIR = {
      ...base,
      startSymbols: ["input"],
      rules: [
        {
          name: "input",
          alternatives: [
            { items: [{ kind: "symbol", name: "loop" }] },
            { items: [{ kind: "terminal", literal: "NUM" }] },
          ],
        },
        {
          name: "loop",
          alternatives: [
            {
              items: [
                { kind: "symbol", name: "loop" },
                { kind: "terminal", literal: "NUM" },
              ],
            },
          ],
        },
      ],
    };
    const features = analyzeGrammar(ir);
    expect(features.structure.unproductiveSymbols).toEqual(["loop"]);
    expect(features.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ANALYZER006_UNPRODUCTIVE_RULES" }),
    );
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

  it("unions dependencies when a noncanonical IR repeats a rule name", () => {
    const base = fixtureIR("empty");
    const ir: GrammarIR = {
      ...base,
      startSymbols: ["input"],
      rules: [
        {
          name: "input",
          alternatives: [{ items: [{ kind: "symbol", name: "helper" }] }],
        },
        {
          name: "input",
          alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }],
        },
        {
          name: "helper",
          alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }],
        },
      ],
    };
    const features = analyzeGrammar(ir);
    expect(features.structure.reachableRules).toBe(2);
    expect(features.structure.unreachableSymbols).toEqual([]);
  });

  it(
    "handles a long dependency chain without recursive Tarjan frames",
    () => {
      const base = fixtureIR("empty");
      const ruleCount = 5_000;
      const rules: GrammarIR["rules"] = Array.from({ length: ruleCount }, (_, index) => ({
        name: `r${index}`,
        alternatives: [
          {
            items:
              index + 1 < ruleCount
                ? [{ kind: "symbol", name: `r${index + 1}` }]
                : [{ kind: "terminal", literal: "END" }],
          },
        ],
      }));
      const features = analyzeGrammar({
        ...base,
        startSymbols: ["r0"],
        terminals: [{ name: "END" }],
        rules,
      });
      expect(features.structure.reachableRules).toBe(ruleCount);
      expect(features.structure.maxDependencyDepth).toBe(ruleCount - 1);
    },
    LONG_CHAIN_TEST_TIMEOUT_MS,
  );

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
    const future = { ...fixtureIR("calc"), irVersion: "1.4.0" };
    expect(analyzeGrammar(future).diagnostics).toContainEqual(
      expect.objectContaining({ code: "ANALYZER004_FUTURE_IR_MINOR" }),
    );
  });
});
