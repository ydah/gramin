import { readFileSync } from "node:fs";
import { type Expr, type GrammarIR, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { cfgExtensionFeatures } from "./cfg-extensions.js";

const fixture = validateIR(
  JSON.parse(
    readFileSync(
      new URL("../../frontend-yacc/fixtures/golden/empty.ir.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);
if (!fixture.ok) throw new Error("invalid empty.ir.json fixture");
const base = fixture.value;

const grammar = (
  rules: GrammarIR["rules"],
  capabilities: Partial<GrammarIR["capabilities"]> = {},
): GrammarIR => ({
  ...base,
  rules,
  startSymbols: rules[0] === undefined ? [] : [rules[0].name],
  capabilities: { ...base.capabilities, ...capabilities },
});
const symbol = (name: string): Expr => ({ kind: "symbol", name });
const literal = (value: string): Expr => ({ kind: "terminal", literal: value });
const rule = (name: string, ...alternatives: Expr[][]): GrammarIR["rules"][number] => ({
  name,
  alternatives: alternatives.map((items) => ({ items })),
});

describe("nullable repetitions", () => {
  it("counts star and plus occurrences whose referenced operand accepts epsilon", () => {
    const result = cfgExtensionFeatures(
      grammar(
        [
          rule("N", [], [literal("x")]),
          rule("S", [
            { kind: "star", expr: symbol("N") },
            { kind: "plus", expr: symbol("N") },
            { kind: "star", expr: literal("x") },
          ]),
        ],
        { ebnfSugar: true },
      ),
    );
    expect(result.sugar).toEqual({ nullableRepetitions: 2 });
  });

  it("counts nested source occurrences and empty literals without expanding sugar", () => {
    const result = cfgExtensionFeatures(
      grammar(
        [
          rule("S", [
            { kind: "star", expr: { kind: "plus", expr: literal("") } },
            { kind: "plus", expr: { kind: "star", expr: literal("x") } },
          ]),
        ],
        { ebnfSugar: true },
      ),
    );
    expect(result.sugar).toEqual({ nullableRepetitions: 3 });
  });

  it("follows nullable sequences, groups, choices, and optional operands", () => {
    const result = cfgExtensionFeatures(
      grammar(
        [
          rule("S", [
            {
              kind: "plus",
              expr: {
                kind: "group",
                expr: {
                  kind: "seq",
                  items: [
                    { kind: "choice", ordered: false, alts: [literal("x"), literal("")] },
                    { kind: "opt", expr: literal("y") },
                  ],
                },
              },
            },
          ]),
        ],
        { ebnfSugar: true },
      ),
    );
    expect(result.sugar).toEqual({ nullableRepetitions: 1 });
  });

  it("reports a known zero for plain BNF and an empty grammar", () => {
    expect(cfgExtensionFeatures(grammar([rule("S", [literal("x")])])).sugar).toEqual({
      nullableRepetitions: 0,
    });
    expect(cfgExtensionFeatures(grammar([])).sugar).toEqual({ nullableRepetitions: 0 });
  });
});

describe("indirect left recursion", () => {
  it("counts every member of a three-rule left-corner cycle", () => {
    const result = cfgExtensionFeatures(
      grammar([
        rule("A", [symbol("B"), literal("x")], [literal("a")]),
        rule("B", [symbol("C")]),
        rule("C", [symbol("A")], [literal("c")]),
      ]),
    );
    expect(result.structure).toEqual({ indirectLeftRecursiveRules: 3 });
  });

  it("does not count cycles behind consuming prefixes or direct-only self loops", () => {
    const result = cfgExtensionFeatures(
      grammar([
        rule("A", [literal("x"), symbol("B")]),
        rule("B", [literal("y"), symbol("A")]),
        rule("C", [symbol("C"), literal("z")], [literal("c")]),
      ]),
    );
    expect(result.structure).toEqual({ indirectLeftRecursiveRules: 0 });
  });

  it("follows nullable rule prefixes and retains direct-plus-indirect overlap", () => {
    const result = cfgExtensionFeatures(
      grammar([
        rule("A", [symbol("N"), symbol("B")], [symbol("A")]),
        rule("B", [symbol("A")]),
        rule("N", [], [literal("n")]),
      ]),
    );
    expect(result.structure).toEqual({ indirectLeftRecursiveRules: 2 });
  });

  it("follows grouped choices and nullable repetitions and includes unreachable rules", () => {
    const result = cfgExtensionFeatures(
      grammar(
        [
          rule("S", [literal("s")]),
          rule("A", [
            { kind: "star", expr: literal("x") },
            {
              kind: "group",
              expr: {
                kind: "choice",
                ordered: false,
                alts: [{ kind: "seq", items: [literal(""), symbol("B")] }, literal("a")],
              },
            },
          ]),
          rule("B", [
            { kind: "midRuleAction", codeLength: 10 },
            { kind: "plus", expr: { kind: "opt", expr: symbol("A") } },
          ]),
        ],
        { ebnfSugar: true },
      ),
    );
    expect(result.structure).toEqual({ indirectLeftRecursiveRules: 2 });
  });

  it("does not look past a nonnullable defined rule", () => {
    const result = cfgExtensionFeatures(
      grammar([
        rule("A", [symbol("N"), symbol("B")]),
        rule("B", [symbol("A")]),
        rule("N", [literal("n")]),
      ]),
    );
    expect(result.structure).toEqual({ indirectLeftRecursiveRules: 0 });
  });

  it("reports zero for an empty grammar", () => {
    expect(cfgExtensionFeatures(grammar([])).structure).toEqual({
      indirectLeftRecursiveRules: 0,
    });
  });
});

describe("CFG applicability", () => {
  it.each(["orderedChoice", "predicates", "parameterizedRules"] as const)(
    "omits both measurements for %s source even if it contains no repetition",
    (capability) => {
      const result = cfgExtensionFeatures(grammar([rule("S", [])], { [capability]: true }));
      expect(result.sugar.nullableRepetitions).toBeUndefined();
      expect(result.structure.indirectLeftRecursiveRules).toBeUndefined();
      expect(result.sugar.notApplicable?.nullableRepetitions).toContain(capability);
      expect(result.structure.notApplicable?.indirectLeftRecursiveRules).toContain(capability);
    },
  );

  it.each(["rule", "unknown"] as const)(
    "omits complete counts when a referenced external %s has unknown nullability",
    (kind) => {
      const ir = grammar([rule("S", [{ kind: "plus", expr: symbol("External") }, symbol("S")])], {
        ebnfSugar: true,
      });
      const result = cfgExtensionFeatures({
        ...ir,
        externalSymbols: [{ name: "External", kind, origin: "import" }],
      });
      expect(result.sugar).toEqual({
        notApplicable: { nullableRepetitions: expect.stringContaining("undefined rule") },
      });
      expect(result.structure).toEqual({
        notApplicable: { indirectLeftRecursiveRules: expect.stringContaining("undefined rule") },
      });
    },
  );

  it("does not mistake unresolved nullable prefixes for a known zero", () => {
    const result = cfgExtensionFeatures(
      grammar([rule("A", [symbol("Missing"), symbol("B")]), rule("B", [symbol("A")])]),
    );
    expect(result.sugar).toEqual({ nullableRepetitions: 0 });
    expect(result.structure).toEqual({
      notApplicable: { indirectLeftRecursiveRules: expect.stringContaining("undefined rule") },
    });
  });

  it("accepts declared and external terminal references and unused external rules", () => {
    const ir = grammar(
      [rule("S", [{ kind: "star", expr: symbol("ITEM") }, symbol("ExternalToken")])],
      { ebnfSugar: true },
    );
    const result = cfgExtensionFeatures({
      ...ir,
      externalSymbols: [
        { name: "ExternalToken", kind: "terminal", origin: "import" },
        { name: "Unused", kind: "rule", origin: "import" },
      ],
    });
    expect(result).toEqual({
      sugar: { nullableRepetitions: 0 },
      structure: { indirectLeftRecursiveRules: 0 },
    });
  });
});
