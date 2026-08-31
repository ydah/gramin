import { describe, expect, it } from "vitest";
import type { Expr, GrammarIR } from "./index.js";
import {
  compareBytes,
  GrammarFeaturesSchemaDocument,
  GrammarIRSchemaDocument,
  MAX_SUPPORTED_NESTING_DEPTH,
  serializeCanonical,
  validateIR,
} from "./index.js";

const baseIR = (): GrammarIR => ({
  irVersion: "1.3.0",
  source: {
    format: "yacc",
    frontend: { id: "test", version: "0.1.0" },
    fileNames: ["sample.y"],
  },
  capabilities: {
    orderedChoice: false,
    ebnfSugar: false,
    predicates: false,
    scannerless: false,
    precedenceTable: true,
    parameterizedRules: false,
    lexerRules: false,
  },
  startSymbols: ["start"],
  terminals: [{ name: "WORD", literal: "word" }, { literal: "+" }],
  externalSymbols: [],
  precedence: [{ assoc: "left", tokens: ["+"], loc: span(1) }],
  rules: [
    {
      name: "start",
      loc: span(3),
      alternatives: [
        {
          items: [
            { kind: "symbol", name: "start" },
            { kind: "terminal", literal: "+" },
            { kind: "terminal", name: "WORD", literal: "word" },
          ],
          action: { present: true, codeLength: 12 },
          loc: span(3),
        },
        { items: [], loc: span(4) },
      ],
    },
  ],
  diagnostics: [],
});

const span = (line: number) => ({
  startLine: line,
  startCol: 1,
  endLine: line,
  endCol: 2,
});

const ebnfIR = (): GrammarIR => {
  const nestedChoice: Expr = {
    kind: "choice",
    ordered: false,
    alts: [
      { kind: "seq", items: [] },
      {
        kind: "seq",
        items: [
          { kind: "symbol", name: "item", args: [{ kind: "terminal", literal: "," }] },
          { kind: "midRuleAction", codeLength: 4 },
        ],
      },
    ],
  };
  return {
    ...baseIR(),
    source: {
      format: "bnf",
      frontend: { id: "test-ebnf", version: "0.1.0" },
    },
    capabilities: {
      ...baseIR().capabilities,
      ebnfSugar: true,
      precedenceTable: false,
      parameterizedRules: true,
    },
    precedence: [],
    rules: [
      {
        name: "start",
        params: ["T"],
        isInline: true,
        alternatives: [
          {
            items: [
              { kind: "opt", expr: { kind: "group", expr: nestedChoice } },
              { kind: "star", expr: { kind: "symbol", name: "item" } },
              { kind: "plus", expr: { kind: "terminal", literal: "x" } },
            ],
          },
        ],
      },
      {
        name: "item",
        alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }],
      },
    ],
  };
};

const pegIR = (): GrammarIR => ({
  ...baseIR(),
  source: {
    format: "peg",
    frontend: { id: "test-peg", version: "0.1.0" },
  },
  capabilities: {
    ...baseIR().capabilities,
    ebnfSugar: true,
    orderedChoice: true,
    predicates: true,
    scannerless: true,
    precedenceTable: false,
  },
  precedence: [],
  terminals: [],
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
                alts: [
                  {
                    kind: "predicate",
                    positive: false,
                    expr: { kind: "charClass", pattern: "a-z" },
                  },
                  { kind: "anyChar" },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
});

describe("Grammar IR schema", () => {
  it.each([baseIR(), ebnfIR(), pegIR()])("accepts a valid sample", (sample) => {
    expect(validateIR(sample)).toEqual({ ok: true, value: sample, issues: [] });
  });

  it.each([
    { ...baseIR(), irVersion: "v1" },
    { ...baseIR(), irVersion: "2.0.0" },
    { ...baseIR(), unexpected: true },
    { ...baseIR(), startSymbols: "start" },
    { ...baseIR(), terminals: [{}] },
    {
      ...baseIR(),
      rules: [
        {
          name: "start",
          alternatives: [{ items: [], action: { present: true, codeLength: -1 } }],
        },
      ],
    },
  ])("rejects a schema violation", (sample) => {
    expect(validateIR(sample).ok).toBe(false);
  });

  it("publishes Draft 2020-12 schema documents", () => {
    expect(GrammarIRSchemaDocument.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(GrammarFeaturesSchemaDocument.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(GrammarFeaturesSchemaDocument.$id).toBe("https://gramin.dev/schema/features-v0.7.json");
  });
});

describe("Grammar IR canonical form", () => {
  const withOnlyItem = (item: Expr): GrammarIR => ({
    ...baseIR(),
    rules: [{ name: "start", alternatives: [{ items: [item] }] }],
  });

  it("validates deeply nested expression unions without exponential backtracking", () => {
    let expression: Expr = { kind: "terminal", literal: "x" };
    for (let depth = 0; depth < 32; depth += 1) {
      expression =
        depth % 2 === 0 ? { kind: "group", expr: expression } : { kind: "opt", expr: expression };
    }
    const sample: GrammarIR = {
      ...withOnlyItem({ kind: "opt", expr: expression }),
      capabilities: { ...baseIR().capabilities, ebnfSugar: true },
    };

    expect(validateIR(sample).ok).toBe(true);
  });

  it("rejects expression nesting before recursive schema validation overflows", () => {
    let expression: Expr = { kind: "terminal", literal: "x" };
    for (let depth = 1; depth < MAX_SUPPORTED_NESTING_DEPTH; depth += 1) {
      expression = { kind: "opt", expr: expression };
    }
    const atLimit: GrammarIR = {
      ...withOnlyItem(expression),
      capabilities: { ...baseIR().capabilities, ebnfSugar: true },
    };

    expect(validateIR(atLimit).ok).toBe(true);

    const result = validateIR({
      ...atLimit,
      rules: [
        { ...atLimit.rules[0], alternatives: [{ items: [{ kind: "opt", expr: expression }] }] },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: "IR_NESTING_TOO_DEEP" }),
      );
    }
  });

  it.each([
    withOnlyItem({
      kind: "choice",
      ordered: false,
      alts: [{ kind: "terminal", literal: "x" }],
    }),
    withOnlyItem({
      kind: "seq",
      items: [{ kind: "terminal", literal: "x" }],
    }),
    withOnlyItem({
      kind: "group",
      expr: { kind: "terminal", literal: "x" },
    }),
    withOnlyItem({
      kind: "opt",
      expr: {
        kind: "seq",
        items: [{ kind: "seq", items: [{ kind: "terminal", literal: "x" }] }],
      },
    }),
    { ...baseIR(), capabilities: { ...baseIR().capabilities, orderedChoice: true } },
    { ...baseIR(), capabilities: { ...baseIR().capabilities, scannerless: true } },
    { ...baseIR(), startSymbols: ["missing"] },
  ])("rejects a canonical-form violation", (sample) => {
    const result = validateIR(sample);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code.startsWith("IR_CANON_"))).toBe(true);
    }
  });

  it("accounts for ordered rule alternatives in capability validation", () => {
    const orderedRule: GrammarIR = {
      ...baseIR(),
      capabilities: { ...baseIR().capabilities, orderedChoice: true },
      rules: [
        {
          name: "start",
          orderedAlternatives: true,
          alternatives: [{ items: [] }, { items: [{ kind: "terminal", literal: "x" }] }],
        },
      ],
    };
    expect(validateIR(orderedRule).ok).toBe(true);
    expect(
      validateIR({
        ...orderedRule,
        capabilities: { ...orderedRule.capabilities, orderedChoice: false },
      }).ok,
    ).toBe(false);
  });

  it.each([
    [
      "IR_CANON_EBNF_SUGAR_CAPABILITY",
      withOnlyItem({ kind: "opt", expr: { kind: "terminal", literal: "x" } }),
    ],
    [
      "IR_CANON_PREDICATES_CAPABILITY",
      withOnlyItem({
        kind: "predicate",
        positive: true,
        expr: { kind: "terminal", literal: "x" },
      }),
    ],
    [
      "IR_CANON_PARAMETERIZED_RULES_CAPABILITY",
      withOnlyItem({
        kind: "symbol",
        name: "start",
        args: [{ kind: "terminal", literal: "x" }],
      }),
    ],
  ])("rejects a false node-derived capability: %s", (code, sample) => {
    const result = validateIR(sample);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain(code);
  });

  it("allows a top-level group only to preserve a nested choice", () => {
    expect(
      validateIR(
        withOnlyItem({
          kind: "group",
          expr: {
            kind: "choice",
            ordered: false,
            alts: [
              { kind: "terminal", literal: "x" },
              { kind: "terminal", literal: "y" },
            ],
          },
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects repeated rule names in the canonical form", () => {
    const firstRule = baseIR().rules[0];
    if (!firstRule) throw new Error("expected base rule");
    const duplicate = {
      ...baseIR(),
      rules: [
        firstRule,
        { ...firstRule, alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }] },
      ],
    };
    const result = validateIR(duplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "IR_CANON_DUPLICATE_RULE",
          path: "/rules/1/name",
        }),
      );
    }
  });

  it("rejects source metrics that cannot describe the grammar", () => {
    const result = validateIR({
      ...baseIR(),
      sourceMetrics: {
        sourceCharacters: 4,
        comments: { count: 1, characters: 5, documentedRules: ["missing"] },
        explicitEmptyAlternatives: 2,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toEqual([
        "IR_CANON_SOURCE_COMMENT_SIZE",
        "IR_CANON_DOCUMENTED_RULE",
        "IR_CANON_EXPLICIT_EMPTY_COUNT",
      ]);
    }
  });
});

describe("canonical serialization", () => {
  it("orders strings by UTF-8 bytes", () => {
    expect(compareBytes("\u{1D400}x", "\uFF21x")).toBe(1);
  });

  it("does not require Node's Buffer global", () => {
    const nodeBuffer = globalThis.Buffer;
    try {
      Object.defineProperty(globalThis, "Buffer", {
        configurable: true,
        value: undefined,
      });
      expect(compareBytes("b", "a")).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(globalThis, "Buffer", {
        configurable: true,
        value: nodeBuffer,
      });
    }
  });

  it("is byte deterministic and can remove source locations", () => {
    const sample = baseIR();
    const first = serializeCanonical(sample);
    const second = serializeCanonical(sample);
    expect(first).toBe(second);
    expect(serializeCanonical(sample, { stripLocations: true })).not.toContain('"loc"');
  });
});
