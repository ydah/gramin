import { existsSync, readFileSync } from "node:fs";
import { analyzeGrammar } from "@gramin/analyzer";
import {
  type Expr,
  type Frontend,
  type GrammarFeatures,
  type GrammarIR,
  serializeCanonical,
  validateIR,
} from "@gramin/core";
import { antlrFrontend } from "@gramin/frontend-antlr";
import { bnfFrontend } from "@gramin/frontend-bnf";
import { menhirFrontend } from "@gramin/frontend-menhir";
import { pegFrontend } from "@gramin/frontend-peg";
import { yaccFrontend } from "@gramin/frontend-yacc";
import { describe, expect, it } from "vitest";

const corpus = new URL("../../../fixtures/cross-format/json/", import.meta.url);
const cases: readonly [string, Frontend][] = [
  ["json.y", yaccFrontend],
  ["json.bnf", bnfFrontend],
  ["Json.g4", antlrFrontend],
  ["json.mly", menhirFrontend],
  ["json.peggy", pegFrontend],
];
const parserRules = ["json", "value", "object", "members", "member", "array", "elements"];
const tokens = [
  "STRING",
  "NUMBER",
  "TRUE",
  "FALSE",
  "NULL",
  "LBRACE",
  "RBRACE",
  "LBRACKET",
  "RBRACKET",
  "COLON",
  "COMMA",
];

const parseFixture = (name: string, frontend: Frontend, directory: URL): GrammarIR => {
  const path = new URL(name, directory);
  expect(existsSync(path), `missing corpus fixture ${path.pathname}`).toBe(true);
  const content = readFileSync(path, "utf8");
  const result = frontend.parse([{ name, content }], {});
  expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
  const validated = validateIR(result.ir);
  if (!validated.ok) throw new Error(JSON.stringify(validated.issues));
  return validated.value;
};

const parserScope = (
  ir: GrammarIR,
  parserRules: readonly string[],
  tokens: readonly string[],
): GrammarIR => {
  const rules = ir.rules.filter(({ name }) => parserRules.includes(name));
  expect(rules.map(({ name }) => name)).toEqual(parserRules);
  const terminalNames = new Set<string>();
  const items = (expression: Expr): Expr[] => {
    if (expression.kind !== "symbol" && expression.kind !== "terminal") {
      throw new Error(`unexpected parser expression: ${expression.kind}`);
    }
    const name =
      expression.kind === "symbol" ? expression.name : (expression.name ?? expression.literal);
    if (name === "_" || name === "EOF") return [];
    if (name !== undefined && tokens.includes(name)) {
      terminalNames.add(name);
      return [{ kind: "terminal", name }];
    }
    expect(name).toBeDefined();
    expect(parserRules).toContain(name);
    return [expression];
  };
  const scoped: GrammarIR = {
    ...ir,
    capabilities: { ...ir.capabilities, scannerless: false, ebnfSugar: false, predicates: false },
    terminals: tokens.map((name) => ({ name })),
    rules: rules.map((rule) => ({
      name: rule.name,
      ...(rule.orderedAlternatives ? { orderedAlternatives: true } : {}),
      alternatives: rule.alternatives.map((alternative) => ({
        items: alternative.items.flatMap(items),
      })),
    })),
  };
  expect([...terminalNames].sort()).toEqual([...tokens].sort());
  expect(validateIR(scoped).ok).toBe(true);
  return scoped;
};

const classAMetrics = (features: GrammarFeatures) => ({
  terminals: features.size.terminals,
  nonterminals: features.size.nonterminals,
  rules: features.size.rules,
  alternatives: features.size.alternatives,
  unresolvedSymbols: features.size.unresolvedSymbols,
  avgAltPerRule: features.size.avgAltPerRule,
  maxAltPerRule: features.size.maxAltPerRule,
  avgRhsLength: features.size.avgRhsLength,
  maxRhsLength: features.size.maxRhsLength,
  emptyAlternatives: features.size.emptyAlternatives,
  altPerRulePercentiles: features.size.altPerRulePercentiles,
  rhsLengthPercentiles: features.size.rhsLengthPercentiles,
  maxDependencyDepth: features.structure.maxDependencyDepth,
  topFanIn: features.structure.topFanIn,
  topFanOut: features.structure.topFanOut,
  unreachableSymbols: features.structure.unreachableSymbols,
  reachableRules: features.structure.reachableRules,
  articulationPoints: features.structure.articulationPoints,
  bridges: features.structure.bridges,
  topBetweenness: features.structure.topBetweenness,
  fanInGini: features.structure.fanInGini,
  fanInEntropy: features.structure.fanInEntropy,
  startSymbolReachability: features.structure.startSymbolReachability,
  unitRules: features.parseability.unitRules,
  commonPrefixPairs: features.redundancy.commonPrefixPairs,
  maxCommonPrefixLength: features.redundancy.maxCommonPrefixLength,
  duplicateAlternatives: features.redundancy.duplicateAlternatives,
  singleReferenceRules: features.redundancy.singleReferenceRules,
  tokenUsage: features.lexicon.tokenUsage,
});

const arithmeticCases: readonly [string, Frontend][] = [
  ["arithmetic.y", yaccFrontend],
  ["arithmetic.bnf", bnfFrontend],
  ["Arithmetic.g4", antlrFrontend],
  ["arithmetic.mly", menhirFrontend],
  ["arithmetic.peggy", pegFrontend],
];

describe.each([
  {
    label: "JSON",
    directory: corpus,
    cases,
    parserRules,
    tokens,
    expectedCounts: {
      terminals: 11,
      rules: 7,
      alternatives: 17,
      unitRules: 5,
      reachableRules: 7,
      unreachableSymbols: [],
      commonPrefixPairs: 4,
    },
  },
  {
    label: "arithmetic",
    directory: new URL("../../../fixtures/cross-format/arithmetic/", import.meta.url),
    cases: arithmeticCases,
    parserRules: ["arithmetic", "expression", "term", "factor"],
    tokens: ["NUMBER", "PLUS", "MINUS", "STAR", "SLASH", "LPAREN", "RPAREN"],
    expectedCounts: {
      terminals: 7,
      rules: 4,
      alternatives: 9,
      unitRules: 3,
      reachableRules: 4,
      unreachableSymbols: [],
      commonPrefixPairs: 6,
    },
  },
])("aligned $label corpus", ({ directory, cases, parserRules, tokens, expectedCounts }) => {
  it.each(cases)(
    "validates and deterministically analyzes %s without unresolved references",
    (name, frontend) => {
      const first = parseFixture(name, frontend, directory);
      const second = parseFixture(name, frontend, directory);
      expect(first.externalSymbols).toEqual([]);
      expect(serializeCanonical(first)).toBe(serializeCanonical(second));
      const features = analyzeGrammar(first, { lr: true });
      expect(features.size.unresolvedSymbols).toEqual({ count: 0, names: [] });
      expect(serializeCanonical(features)).toBe(
        serializeCanonical(analyzeGrammar(second, { lr: true })),
      );
    },
  );

  it("matches every applicable catalog class-A metric in the documented parser scope", () => {
    const firstCase = cases[0];
    if (!firstCase) throw new Error("corpus is empty");
    const baseline = analyzeGrammar(
      parserScope(parseFixture(...firstCase, directory), parserRules, tokens),
      { lr: true },
    );
    expect(classAMetrics(baseline)).toMatchObject(expectedCounts);
    for (const [name, frontend] of cases) {
      const features = analyzeGrammar(
        parserScope(parseFixture(name, frontend, directory), parserRules, tokens),
        { lr: true },
      );
      expect(classAMetrics(features), name).toEqual(classAMetrics(baseline));
      if (features.capabilities.orderedChoice) {
        expect(features.structure.notApplicable?.unproductiveSymbols).toContain("orderedChoice");
      } else {
        expect(features.structure.notApplicable?.unproductiveSymbols).toBeUndefined();
        expect(features.structure.unproductiveSymbols, name).toEqual(
          baseline.structure.unproductiveSymbols,
        );
        expect(features.parseability, name).toEqual(baseline.parseability);
        expect(features.structure.shortestDerivation, name).toEqual(
          baseline.structure.shortestDerivation,
        );
      }
    }
  });

  it.each(cases)(
    "explains class-B applicability through the capabilities of %s",
    (name, frontend) => {
      const ir = parseFixture(name, frontend, directory);
      const original = analyzeGrammar(ir, { lr: true });
      const scoped = analyzeGrammar(parserScope(ir, parserRules, tokens), { lr: true });
      expect(scoped.size.nestedChoiceCount).toBe(0);
      expect(scoped.structure.directLeftRecursiveRules).toBe(0);
      expect(scoped.structure.directRightRecursiveRules).toBe(2);
      expect(scoped.sugar.notApplicable?.opt).toContain("ebnfSugar capability is false");
      if (scoped.capabilities.precedenceTable) {
        expect(scoped.precedence.levels).toBe(0);
      } else {
        expect(scoped.precedence.notApplicable?.levels).toContain(
          "precedenceTable capability is false",
        );
      }
      expect(scoped.sugar.notApplicable?.parameterizedCalls).toContain(
        "parameterizedRules capability is false",
      );
      if (scoped.capabilities.orderedChoice) {
        expect(scoped.structure.nullableRules).toBeUndefined();
        expect(scoped.structure.notApplicable?.nullableRules).toContain("orderedChoice");
        expect(scoped.parseability.firstSetSize).toBeUndefined();
        expect(scoped.parseability.followSetSize).toBeUndefined();
        expect(scoped.parseability.ll1Conflicts).toBeUndefined();
        expect(scoped.parseability.slr).toBeUndefined();
        for (const field of ["firstSetSize", "followSetSize", "ll1Conflicts", "slr"]) {
          expect(scoped.parseability.notApplicable?.[field]).toContain("orderedChoice");
        }
        expect(scoped.structure.shortestDerivation).toEqual([]);
        expect(scoped.structure.notApplicable?.shortestDerivation).toContain("orderedChoice");
        expect(scoped.peg.shadowedAlternativePairs).toBe(0);
      } else {
        expect(scoped.structure.nullableRules).toBe(0);
        expect(scoped.parseability.firstSetSize).toBeDefined();
        expect(scoped.parseability.followSetSize).toBeDefined();
        expect(scoped.parseability.ll1Conflicts).toBeDefined();
        expect(scoped.parseability.slr).toBeDefined();
        expect(scoped.peg.notApplicable?.shadowedAlternativePairs).toContain(
          "orderedChoice capability is false",
        );
      }
      if (ir.capabilities.scannerless) {
        expect(original.lexicon.charClassCount).toBeGreaterThan(0);
        expect(original.lexicon.notApplicable?.namedTokens).toContain("scannerless");
        expect(original.lexicon.notApplicable?.literalTokens).toContain("scannerless");
        expect(ir.capabilities.ebnfSugar).toBe(true);
        expect(original.sugar.star).toBeGreaterThan(0);
        expect(original.size.rules).toBeGreaterThan(scoped.size.rules);
      } else {
        expect(original.lexicon.charClassCount).toBe(0);
        expect(original.lexicon.notApplicable?.namedTokens).toBeUndefined();
      }
    },
  );
});
