import { type Static, Type } from "@sinclair/typebox";
import { DiagnosticSchema, SemverStringSchema, SourceSpanSchema } from "./primitives.js";

export const CapabilitiesSchema = Type.Object(
  {
    orderedChoice: Type.Boolean(),
    ebnfSugar: Type.Boolean(),
    predicates: Type.Boolean(),
    scannerless: Type.Boolean(),
    precedenceTable: Type.Boolean(),
    parameterizedRules: Type.Boolean(),
    lexerRules: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ExprSchema = Type.Recursive(
  (Expr) =>
    Type.Union([
      Type.Object(
        {
          kind: Type.Literal("symbol"),
          name: Type.String({ minLength: 1 }),
          args: Type.Optional(Type.Array(Expr)),
          label: Type.Optional(Type.String({ minLength: 1 })),
        },
        { additionalProperties: false },
      ),
      Type.Union([
        Type.Object(
          {
            kind: Type.Literal("terminal"),
            name: Type.String({ minLength: 1 }),
            literal: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            kind: Type.Literal("terminal"),
            name: Type.Optional(Type.String({ minLength: 1 })),
            literal: Type.String(),
          },
          { additionalProperties: false },
        ),
      ]),
      Type.Object(
        { kind: Type.Literal("seq"), items: Type.Array(Expr) },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          kind: Type.Literal("choice"),
          ordered: Type.Boolean(),
          alts: Type.Array(Expr, { minItems: 1 }),
        },
        { additionalProperties: false },
      ),
      Type.Object({ kind: Type.Literal("opt"), expr: Expr }, { additionalProperties: false }),
      Type.Object({ kind: Type.Literal("star"), expr: Expr }, { additionalProperties: false }),
      Type.Object({ kind: Type.Literal("plus"), expr: Expr }, { additionalProperties: false }),
      Type.Object(
        { kind: Type.Literal("predicate"), positive: Type.Boolean(), expr: Expr },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          kind: Type.Literal("charClass"),
          pattern: Type.String(),
          negated: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      Type.Object({ kind: Type.Literal("anyChar") }, { additionalProperties: false }),
      Type.Object(
        {
          kind: Type.Literal("midRuleAction"),
          codeLength: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
      Type.Object({ kind: Type.Literal("group"), expr: Expr }, { additionalProperties: false }),
    ]),
  { $id: "Expr" },
);

const TerminalDeclSchema = Type.Union([
  Type.Object(
    {
      name: Type.String({ minLength: 1 }),
      literal: Type.Optional(Type.String()),
      declaredType: Type.Optional(Type.String()),
      loc: Type.Optional(SourceSpanSchema),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      name: Type.Optional(Type.String({ minLength: 1 })),
      literal: Type.String(),
      declaredType: Type.Optional(Type.String()),
      loc: Type.Optional(SourceSpanSchema),
    },
    { additionalProperties: false },
  ),
]);

const ExternalSymbolSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    origin: Type.String({ minLength: 1 }),
    kind: Type.Union([Type.Literal("rule"), Type.Literal("terminal"), Type.Literal("unknown")]),
  },
  { additionalProperties: false },
);

const PrecedenceLevelSchema = Type.Object(
  {
    assoc: Type.Union([
      Type.Literal("left"),
      Type.Literal("right"),
      Type.Literal("nonassoc"),
      Type.Literal("precedence"),
    ]),
    tokens: Type.Array(Type.String({ minLength: 1 })),
    loc: Type.Optional(SourceSpanSchema),
  },
  { additionalProperties: false },
);

const AlternativeSchema = Type.Object(
  {
    items: Type.Array(ExprSchema),
    label: Type.Optional(Type.String({ minLength: 1 })),
    precedence: Type.Optional(Type.String({ minLength: 1 })),
    action: Type.Optional(
      Type.Object(
        {
          present: Type.Boolean(),
          codeLength: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
    ),
    loc: Type.Optional(SourceSpanSchema),
  },
  { additionalProperties: false },
);

const RuleSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    params: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    isInline: Type.Optional(Type.Boolean()),
    declaredType: Type.Optional(Type.String()),
    alternatives: Type.Array(AlternativeSchema, { minItems: 1 }),
    loc: Type.Optional(SourceSpanSchema),
  },
  { additionalProperties: false },
);

export const GrammarIRSchema = Type.Object(
  {
    irVersion: SemverStringSchema,
    source: Type.Object(
      {
        format: Type.String({ minLength: 1 }),
        dialect: Type.Optional(Type.String({ minLength: 1 })),
        fileNames: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
        frontend: Type.Object(
          {
            id: Type.String({ minLength: 1 }),
            version: SemverStringSchema,
          },
          { additionalProperties: false },
        ),
      },
      { additionalProperties: false },
    ),
    capabilities: CapabilitiesSchema,
    startSymbols: Type.Array(Type.String({ minLength: 1 })),
    terminals: Type.Array(TerminalDeclSchema),
    externalSymbols: Type.Array(ExternalSymbolSchema),
    precedence: Type.Array(PrecedenceLevelSchema),
    rules: Type.Array(RuleSchema),
    diagnostics: Type.Array(DiagnosticSchema),
  },
  { additionalProperties: false, $id: "https://gramin.dev/schema/grammar-ir-v0.2.json" },
);

export type Capabilities = Static<typeof CapabilitiesSchema>;
export type Expr = Static<typeof ExprSchema>;
export type GrammarIR = Static<typeof GrammarIRSchema>;
export type Alternative = GrammarIR["rules"][number]["alternatives"][number];
export type Diagnostic = Static<typeof DiagnosticSchema>;
export type Rule = GrammarIR["rules"][number];
export type SourceSpan = Static<typeof SourceSpanSchema>;
export type TerminalDecl = GrammarIR["terminals"][number];
