import { describe, expect, it } from "vitest";
import type { Expr, GrammarIR } from "./index.js";
import {
  GrammarFeaturesSchemaDocument,
  GrammarIRSchemaDocument,
  serializeCanonical,
  validateIR,
} from "./index.js";

const baseIR = (): GrammarIR => ({
  irVersion: "1.2.0",
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
  });
});

describe("Grammar IR canonical form", () => {
  const withOnlyItem = (item: Expr): GrammarIR => ({
    ...baseIR(),
    rules: [{ name: "start", alternatives: [{ items: [item] }] }],
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
});

describe("canonical serialization", () => {
  it("is byte deterministic and can remove source locations", () => {
    const sample = baseIR();
    const first = serializeCanonical(sample);
    const second = serializeCanonical(sample);
    expect(first).toBe(second);
    expect(serializeCanonical(sample, { stripLocations: true })).not.toContain('"loc"');
  });
});
