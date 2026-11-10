import { type Expr, type GrammarIR, type Rule, serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { analyzeGrammar } from "./analyze.js";
import { alternativeEdgeReference, collectReferences } from "./expressions.js";

const symbol = (name: string, ...args: Expr[]): Expr =>
  args.length === 0 ? { kind: "symbol", name } : { kind: "symbol", name, args };
const literal = (value: string): Expr => ({ kind: "terminal", literal: value });
const rule = (name: string, items: Expr[][], params?: string[]): Rule => ({
  name,
  alternatives: items.map((items) => ({ items })),
  ...(params === undefined ? {} : { params }),
});
const grammar = (rules: Rule[], start: string): GrammarIR => {
  const input: GrammarIR = {
    irVersion: "1.4.0",
    source: { format: "test", frontend: { id: "test", version: "1.0.0" } },
    capabilities: {
      orderedChoice: false,
      ebnfSugar: false,
      predicates: false,
      scannerless: false,
      precedenceTable: false,
      parameterizedRules: rules.some(({ params }) => params !== undefined),
      lexerRules: false,
    },
    startSymbols: [start],
    terminals: [
      { literal: "a" },
      { literal: "b" },
      { literal: "f" },
      { literal: "x" },
      { name: "X" },
      { name: "error" },
    ],
    externalSymbols: [],
    precedence: [],
    rules,
    diagnostics: [],
  };
  const validated = validateIR(input);
  if (!validated.ok) throw new Error(JSON.stringify(validated.issues));
  return validated.value;
};

const ordered = (ir: GrammarIR): GrammarIR => {
  const validated = validateIR({
    ...ir,
    capabilities: { ...ir.capabilities, orderedChoice: true },
    rules: ir.rules.map((rule) => ({ ...rule, orderedAlternatives: true })),
  });
  if (!validated.ok) throw new Error(JSON.stringify(validated.issues));
  return validated.value;
};

describe("formal parameter scope", () => {
  it("does not classify an ordinary rule named error as a recovery token", () => {
    const features = analyzeGrammar(
      grammar([rule("error", [[literal("x")]]), rule("entry", [[symbol("error")]])], "entry"),
    );
    expect(features.operations).toMatchObject({
      errorTokenUses: 0,
      rulesWithErrorRecovery: 0,
      symbolReferences: 1,
    });
    expect(features.perRule.find(({ rule }) => rule === "entry")?.references).toEqual(["error"]);
  });

  it.each([
    ["rule", "stdlib", 0],
    ["terminal", "builtin", 1],
  ] as const)("uses external %s role for a symbol named error", (kind, origin, uses) => {
    const source = grammar([rule("entry", [[symbol("error")]])], "entry");
    const validated = validateIR({ ...source, externalSymbols: [{ name: "error", kind, origin }] });
    if (!validated.ok) throw new Error(JSON.stringify(validated.issues));
    expect(analyzeGrammar(validated.value).operations).toMatchObject({
      errorTokenUses: uses,
      rulesWithErrorRecovery: uses,
      symbolReferences: 1,
    });
  });

  it("does not classify a local definition as a shadowed standard-library call", () => {
    const source = grammar(
      [rule("option", [[symbol("X")]], ["X"]), rule("entry", [[symbol("option", literal("x"))]])],
      "entry",
    );
    const validated = validateIR({
      ...source,
      externalSymbols: [{ name: "option", kind: "rule", origin: "stdlib" }],
    });
    if (!validated.ok) throw new Error(JSON.stringify(validated.issues));
    expect(analyzeGrammar(validated.value).sugar.parameterizedCalls).toEqual({
      total: 1,
      known: {},
    });
  });

  it("retains a standard-library call when no binding or definition shadows it", () => {
    const source = grammar(
      [rule("unused", [[symbol("X")]], ["X"]), rule("entry", [[symbol("option", literal("x"))]])],
      "entry",
    );
    const validated = validateIR({
      ...source,
      externalSymbols: [{ name: "option", kind: "rule", origin: "stdlib" }],
    });
    if (!validated.ok) throw new Error(JSON.stringify(validated.issues));
    expect(analyzeGrammar(validated.value).sugar.parameterizedCalls).toEqual({
      total: 1,
      known: { option: 1 },
    });
  });

  it("does not classify a bound error formal as recovery while retaining raw reference counts", () => {
    const features = analyzeGrammar(
      grammar(
        [rule("p", [[symbol("error")]], ["error"]), rule("entry", [[symbol("p", literal("a"))]])],
        "entry",
      ),
    );
    expect(features.operations).toMatchObject({
      errorTokenUses: 0,
      rulesWithErrorRecovery: 0,
      symbolReferences: 2,
    });
  });

  it("retains explicit error terminals inside arguments of bound callees", () => {
    const features = analyzeGrammar(
      grammar(
        [
          rule("p", [[symbol("error", { kind: "terminal", name: "error" })]], ["error"]),
          rule("entry", [[symbol("p", literal("a"))]]),
        ],
        "entry",
      ),
    );
    expect(features.operations).toMatchObject({
      errorTokenUses: 1,
      rulesWithErrorRecovery: 1,
      symbolReferences: 2,
    });
  });

  it("does not classify a bound callee as a standard-library call", () => {
    const source = grammar(
      [
        rule("p", [[symbol("option", symbol("X"))]], ["option"]),
        rule("X", [[literal("x")]]),
        rule("entry", [[symbol("p", literal("a"))]]),
      ],
      "entry",
    );
    const validated = validateIR({
      ...source,
      externalSymbols: [{ name: "option", kind: "rule", origin: "stdlib" }],
    });
    if (!validated.ok) throw new Error(JSON.stringify(validated.issues));
    const features = analyzeGrammar(validated.value);
    expect(features.sugar.parameterizedCalls).toEqual({ total: 2, known: {} });
    expect(features.perRule.find(({ rule }) => rule === "p")?.references).toEqual(["X"]);
  });

  it("does not resolve a formal through a colliding global PEG rule", () => {
    const features = analyzeGrammar(
      ordered(
        grammar(
          [
            rule("p", [[symbol("X")], [literal("b")]], ["X"]),
            rule("X", [[literal("b")]]),
            rule("entry", [[symbol("p", literal("a"))]]),
          ],
          "entry",
        ),
      ),
    );
    expect(features.peg.potentialShadowedAlternativePairs).toBe(0);
  });

  it("does not propagate a colliding global literal through a parameterized PEG definition", () => {
    const features = analyzeGrammar(
      ordered(
        grammar(
          [
            rule("p", [[symbol("X")]], ["X"]),
            rule("X", [[literal("b")]]),
            rule("entry", [[symbol("p", literal("a"))], [literal("b")]]),
          ],
          "entry",
        ),
      ),
    );
    expect(features.peg.potentialShadowedAlternativePairs).toBe(0);
  });

  it("retains ordinary unbound PEG literal lookup in a parameterized grammar", () => {
    const features = analyzeGrammar(
      ordered(
        grammar(
          [
            rule("p", [[symbol("X")]], ["X"]),
            rule("X", [[literal("b")]]),
            rule("entry", [[symbol("X")], [literal("b")]]),
          ],
          "entry",
        ),
      ),
    );
    expect(features.peg.potentialShadowedAlternativePairs).toBe(1);
  });

  it("keeps bound prefixes in place while excluding them from free references", () => {
    const alternative = {
      items: [
        {
          kind: "group",
          expr: {
            kind: "seq",
            items: [{ kind: "midRuleAction", codeLength: 0 }, symbol("X"), symbol("A")],
          },
        },
      ],
    } satisfies Rule["alternatives"][number];
    const parameters = new Set(["X"]);
    expect(collectReferences(alternative, parameters)).toEqual(new Set(["A"]));
    expect(alternativeEdgeReference(alternative, "first", parameters)).toBeUndefined();
    expect(alternativeEdgeReference(alternative, "last", parameters)).toBe("A");
    expect(alternativeEdgeReference(alternative, "first")).toBe("X");
  });

  it("excludes a bound formal from dependencies even when a global rule has that name", () => {
    const ir = grammar(
      [rule("p", [[symbol("X")]], ["X"]), rule("X", [[symbol("p", literal("a"))]])],
      "X",
    );
    const original = serializeCanonical(ir);
    const features = analyzeGrammar(ir, { lr: true });
    expect(
      features.perRule.map(({ rule, references, referencedBy, fanIn, fanOut }) => ({
        rule,
        references,
        referencedBy,
        fanIn,
        fanOut,
      })),
    ).toEqual([
      { rule: "X", references: ["p"], referencedBy: [], fanIn: 0, fanOut: 1 },
      { rule: "p", references: [], referencedBy: ["X"], fanIn: 1, fanOut: 0 },
    ]);
    expect(features.structure.sccSizeHistogram).toEqual([{ size: 1, count: 2 }]);
    expect(features.structure.recursionSccCount).toBe(0);
    expect(features.redundancy.singleReferenceRules).toEqual(["p"]);
    expect(features.parseability.unitRules).toBe(0);
    expect(features.parseability.firstSetSize).toBeDefined();
    expect(features.parseability.slr).toBeDefined();
    expect(features.operations.symbolReferences).toBe(2);
    expect(serializeCanonical(ir)).toBe(original);
  });

  it("does not invent recursion, list recursion, or unit cycles from a self-named formal", () => {
    const features = analyzeGrammar(
      grammar(
        [
          rule(
            "items",
            [[symbol("items")], [symbol("items"), literal("x")], [literal("b")]],
            ["items"],
          ),
          rule("entry", [[symbol("items", literal("a"))]]),
        ],
        "entry",
      ),
      { lr: true },
    );
    expect(features.structure.directLeftRecursiveRules).toBe(0);
    expect(features.structure.directRightRecursiveRules).toBe(0);
    expect(features.structure.recursiveRules.count).toBe(0);
    expect(features.parseability.unitRules).toBe(0);
    expect(features.parseability.cyclicUnitRules).toEqual([]);
    expect(features.redundancy.listRecursion).toMatchObject({ left: 0, right: 0, mixed: 0 });
    expect(features.diagnostics.some(({ code }) => code === "ANALYZER007_CYCLIC_UNIT_RULES")).toBe(
      false,
    );
    expect(features.parseability.slr).toBeDefined();
    expect(features.operations.symbolReferences).toBe(3);
  });

  it("keeps free references inside arguments of a bound symbol", () => {
    const features = analyzeGrammar(
      grammar(
        [
          rule("p", [[symbol("F", symbol("X"))]], ["F"]),
          rule("F", [[literal("f")]]),
          rule("X", [[literal("x")]]),
          rule("entry", [[symbol("p", literal("a"))]]),
        ],
        "entry",
      ),
    );
    expect(features.perRule.find(({ rule }) => rule === "p")?.references).toEqual(["X"]);
    expect(features.perRule.find(({ rule }) => rule === "F")?.fanIn).toBe(0);
    expect(features.perRule.find(({ rule }) => rule === "X")?.fanIn).toBe(1);
    expect(features.redundancy.singleReferenceRules).toEqual(["X", "p"]);
  });

  it("retains named terminals that share a formal name", () => {
    const token: Expr = { kind: "terminal", name: "X" };
    const ir = grammar(
      [rule("X", [[token]], ["X"]), rule("entry", [[symbol("X", token)]])],
      "entry",
    );
    const original = serializeCanonical(ir);
    const features = analyzeGrammar(ir, { lr: true });
    expect(features.parseability.firstSetSize?.average).toBe(1);
    expect(features.perRule.find(({ rule }) => rule === "X")?.references).toEqual([]);
    expect(features.operations.symbolReferences).toBe(1);
    expect(serializeCanonical(ir)).toBe(original);
  });

  it("retains genuine recursive calls to an unbound source rule", () => {
    const features = analyzeGrammar(
      grammar(
        [
          rule("items", [[symbol("items", symbol("X")), literal("x")], [symbol("X")]], ["X"]),
          rule("entry", [[symbol("items", literal("a"))]]),
        ],
        "entry",
      ),
      { lr: true },
    );
    expect(features.structure.directLeftRecursiveRules).toBe(1);
    expect(features.structure.directRightRecursiveRules).toBe(0);
    expect(features.structure.recursiveRules.count).toBe(1);
    expect(features.redundancy.listRecursion).toMatchObject({ left: 1, right: 0, mixed: 0 });
    expect(features.perRule.find(({ rule }) => rule === "items")?.references).toEqual(["items"]);
  });

  it("retains genuine ordinary unit cycles and recursion", () => {
    const features = analyzeGrammar(
      grammar([rule("a", [[symbol("b")]]), rule("b", [[symbol("a")]])], "a"),
    );
    expect(features.structure.sccSizeHistogram).toEqual([{ size: 2, count: 1 }]);
    expect(features.parseability.unitRules).toBe(2);
    expect(features.parseability.cyclicUnitRules).toEqual([["a", "b"]]);
    expect(features.diagnostics.some(({ code }) => code === "ANALYZER007_CYCLIC_UNIT_RULES")).toBe(
      true,
    );
  });
});
