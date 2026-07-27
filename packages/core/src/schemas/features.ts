import { type Static, Type } from "@sinclair/typebox";
import { DiagnosticSchema, SemverStringSchema } from "./primitives.js";
import { CapabilitiesSchema } from "./ir.js";

const NotApplicableSchema = Type.Record(Type.String(), Type.String({ minLength: 1 }));
const PercentilesSchema = Type.Object(
  {
    p50: Type.Integer({ minimum: 0 }),
    p95: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
const NameListSchema = Type.Object(
  {
    count: Type.Integer({ minimum: 0 }),
    names: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
const RankedSymbolSchema = Type.Object(
  {
    symbol: Type.String(),
    count: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
const MaximumRuleSchema = Type.Object(
  {
    value: Type.Integer({ minimum: 0 }),
    rule: Type.String(),
    line: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

const SizeFeaturesSchema = Type.Object(
  {
    terminals: Type.Integer({ minimum: 0 }),
    nonterminals: Type.Integer({ minimum: 0 }),
    rules: Type.Integer({ minimum: 0 }),
    alternatives: Type.Integer({ minimum: 0 }),
    unresolvedSymbols: NameListSchema,
    avgAltPerRule: Type.Number({ minimum: 0 }),
    maxAltPerRule: MaximumRuleSchema,
    avgRhsLength: Type.Number({ minimum: 0 }),
    maxRhsLength: MaximumRuleSchema,
    nestedChoiceCount: Type.Integer({ minimum: 0 }),
    emptyAlternatives: Type.Integer({ minimum: 0 }),
    altPerRulePercentiles: Type.Optional(PercentilesSchema),
    rhsLengthPercentiles: Type.Optional(PercentilesSchema),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const StructureFeaturesSchema = Type.Object(
  {
    directLeftRecursiveRules: Type.Integer({ minimum: 0 }),
    directRightRecursiveRules: Type.Integer({ minimum: 0 }),
    recursionSccCount: Type.Integer({ minimum: 0 }),
    largestSccSize: Type.Object(
      {
        value: Type.Integer({ minimum: 0 }),
        members: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
    maxDependencyDepth: Type.Integer({ minimum: 0 }),
    topFanIn: Type.Array(RankedSymbolSchema),
    topFanOut: Type.Array(RankedSymbolSchema),
    unreachableSymbols: Type.Array(Type.String()),
    nullableRules: Type.Optional(Type.Integer({ minimum: 0 })),
    reachableRules: Type.Integer({ minimum: 0 }),
    recursiveRules: Type.Object(
      {
        count: Type.Integer({ minimum: 0 }),
        ratio: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
      },
      { additionalProperties: false },
    ),
    largestRecursiveComponent: Type.Object(
      {
        value: Type.Integer({ minimum: 0 }),
        ratio: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
        members: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const PrecedenceFeaturesSchema = Type.Object(
  {
    levels: Type.Optional(Type.Integer({ minimum: 0 })),
    assocBreakdown: Type.Optional(
      Type.Object(
        {
          left: Type.Integer({ minimum: 0 }),
          right: Type.Integer({ minimum: 0 }),
          nonassoc: Type.Integer({ minimum: 0 }),
          precedence: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
    ),
    precOverrides: Type.Optional(Type.Integer({ minimum: 0 })),
    maxTokensPerLevel: Type.Optional(Type.Integer({ minimum: 0 })),
    rulesWithPrecOverrides: Type.Optional(Type.Integer({ minimum: 0 })),
    precOverrideAlternativeRatio: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    tokensInPrecedence: Type.Optional(
      Type.Object(
        {
          count: Type.Integer({ minimum: 0 }),
          ratio: Type.Number({ minimum: 0, maximum: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const LexiconFeaturesSchema = Type.Object(
  {
    namedTokens: Type.Integer({ minimum: 0 }),
    literalTokens: Type.Integer({ minimum: 0 }),
    literalOccurrences: Type.Integer({ minimum: 0 }),
    charClassCount: Type.Integer({ minimum: 0 }),
    anyCharCount: Type.Integer({ minimum: 0 }),
    keywordLike: Type.Array(Type.String()),
    punctuationLike: Type.Array(Type.String()),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const SugarFeaturesSchema = Type.Object(
  {
    opt: Type.Optional(Type.Integer({ minimum: 0 })),
    star: Type.Optional(Type.Integer({ minimum: 0 })),
    plus: Type.Optional(Type.Integer({ minimum: 0 })),
    parameterizedRuleDefs: Type.Optional(Type.Integer({ minimum: 0 })),
    parameterizedCalls: Type.Optional(
      Type.Object(
        {
          total: Type.Integer({ minimum: 0 }),
          known: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
        },
        { additionalProperties: false },
      ),
    ),
    inlineRules: Type.Optional(Type.Integer({ minimum: 0 })),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const ActionFeaturesSchema = Type.Object(
  {
    completeness: Type.Union([Type.Literal("complete"), Type.Literal("partial")]),
    altActionCoverage: Type.Number({ minimum: 0, maximum: 1 }),
    midRuleActions: Type.Integer({ minimum: 0 }),
    avgActionLength: Type.Number({ minimum: 0 }),
    maxActionLength: Type.Integer({ minimum: 0 }),
    trailingActions: Type.Optional(Type.Integer({ minimum: 0 })),
    totalActions: Type.Optional(Type.Integer({ minimum: 0 })),
    rulesWithActions: Type.Optional(Type.Integer({ minimum: 0 })),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const NotableFeaturesSchema = Type.Object(
  {
    largestRule: Type.Optional(
      Type.Object(
        {
          name: Type.String(),
          line: Type.Optional(Type.Integer({ minimum: 1 })),
        },
        { additionalProperties: false },
      ),
    ),
    deepestRecursionMembers: Type.Array(Type.String()),
    coreSymbols: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const GrammarFeaturesSchema = Type.Object(
  {
    featuresVersion: SemverStringSchema,
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
    size: SizeFeaturesSchema,
    structure: StructureFeaturesSchema,
    precedence: PrecedenceFeaturesSchema,
    lexicon: LexiconFeaturesSchema,
    sugar: SugarFeaturesSchema,
    actions: ActionFeaturesSchema,
    notable: NotableFeaturesSchema,
    diagnostics: Type.Array(DiagnosticSchema),
  },
  { additionalProperties: false, $id: "https://gramin.dev/schema/features-v0.3.json" },
);

export type GrammarFeatures = Static<typeof GrammarFeaturesSchema>;
export type NotApplicable = Static<typeof NotApplicableSchema>;
