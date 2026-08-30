import { type Static, Type } from "@sinclair/typebox";
import { CapabilitiesSchema } from "./ir.js";
import { DiagnosticSchema, SemverStringSchema } from "./primitives.js";

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
const DistributionSchema = Type.Object(
  {
    average: Type.Number({ minimum: 0 }),
    maximum: Type.Object(
      {
        value: Type.Integer({ minimum: 0 }),
        rule: Type.String(),
      },
      { additionalProperties: false },
    ),
    percentiles: Type.Optional(PercentilesSchema),
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
    unproductiveSymbols: Type.Array(Type.String()),
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
    articulationPoints: Type.Array(Type.String()),
    bridges: Type.Array(
      Type.Object(
        { source: Type.String(), target: Type.String() },
        { additionalProperties: false },
      ),
    ),
    topBetweenness: Type.Array(
      Type.Object(
        { symbol: Type.String(), value: Type.Number({ minimum: 0 }) },
        { additionalProperties: false },
      ),
    ),
    fanInGini: Type.Number({ minimum: 0, maximum: 1 }),
    fanInEntropy: Type.Number({ minimum: 0 }),
    shortestDerivation: Type.Array(
      Type.Object(
        { rule: Type.String(), length: Type.Integer({ minimum: 0 }) },
        { additionalProperties: false },
      ),
    ),
    shortestDerivationUnknown: Type.Array(Type.String()),
    startSymbolReachability: Type.Object(
      {
        entries: Type.Array(
          Type.Object(
            {
              symbol: Type.String(),
              reachableRules: Type.Integer({ minimum: 0 }),
            },
            { additionalProperties: false },
          ),
        ),
        overlapRatio: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
      },
      { additionalProperties: false },
    ),
    maxExpressionNestingDepth: Type.Integer({ minimum: 0 }),
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
    literalPrefixCollisions: Type.Array(
      Type.Object(
        { prefix: Type.String(), literal: Type.String() },
        { additionalProperties: false },
      ),
    ),
    keywordIdentifierCollisions: Type.Array(Type.String()),
    tokenUsage: Type.Object(
      {
        used: Type.Integer({ minimum: 0 }),
        coverage: Type.Number({ minimum: 0, maximum: 1 }),
        singleUse: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
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

const ParseabilityFeaturesSchema = Type.Object(
  {
    firstSetSize: Type.Optional(DistributionSchema),
    followSetSize: Type.Optional(DistributionSchema),
    ll1Conflicts: Type.Optional(
      Type.Object(
        {
          firstFirst: Type.Integer({ minimum: 0 }),
          firstFollow: Type.Integer({ minimum: 0 }),
          total: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
    ),
    unitRules: Type.Integer({ minimum: 0 }),
    cyclicUnitRules: Type.Array(Type.Array(Type.String(), { minItems: 1 })),
    slr: Type.Optional(
      Type.Object(
        {
          states: Type.Integer({ minimum: 0 }),
          shiftReduceConflicts: Type.Integer({ minimum: 0 }),
          reduceReduceConflicts: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
    ),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const RedundancyFeaturesSchema = Type.Object(
  {
    commonPrefixPairs: Type.Integer({ minimum: 0 }),
    maxCommonPrefixLength: Type.Integer({ minimum: 0 }),
    duplicateAlternatives: Type.Integer({ minimum: 0 }),
    structuralCloneGroups: Type.Integer({ minimum: 0 }),
    singleReferenceRules: Type.Array(Type.String()),
    unusedTerminals: Type.Array(Type.String()),
    unusedPrecedenceTokens: Type.Array(Type.String()),
    undefinedPrecedenceOverrides: Type.Array(Type.String()),
    listRecursion: Type.Object(
      {
        left: Type.Integer({ minimum: 0 }),
        right: Type.Integer({ minimum: 0 }),
        mixed: Type.Integer({ minimum: 0 }),
        consistency: Type.Number({ minimum: 0, maximum: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const PegFeaturesSchema = Type.Object(
  {
    predicates: Type.Optional(Type.Integer({ minimum: 0 })),
    maxPredicateNestingDepth: Type.Optional(Type.Integer({ minimum: 0 })),
    shadowedAlternativePairs: Type.Optional(Type.Integer({ minimum: 0 })),
    backtrackingHotspots: Type.Optional(
      Type.Array(
        Type.Object(
          { rule: Type.String(), score: Type.Integer({ minimum: 0 }) },
          { additionalProperties: false },
        ),
      ),
    ),
    charClassOverlapPairs: Type.Optional(Type.Integer({ minimum: 0 })),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const OperationsFeaturesSchema = Type.Object(
  {
    errorTokenUses: Type.Integer({ minimum: 0 }),
    rulesWithErrorRecovery: Type.Integer({ minimum: 0 }),
    recoveryRuleRatio: Type.Number({ minimum: 0, maximum: 1 }),
    namedReferences: Type.Integer({ minimum: 0 }),
    symbolReferences: Type.Integer({ minimum: 0 }),
    namedReferenceRatio: Type.Number({ minimum: 0, maximum: 1 }),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const StyleFeaturesSchema = Type.Object(
  {
    terminalUpperCaseRatio: Type.Number({ minimum: 0, maximum: 1 }),
    nonterminalConvention: Type.Union([
      Type.Literal("snake_case"),
      Type.Literal("camelCase"),
      Type.Literal("mixed"),
      Type.Literal("none"),
    ]),
    nonterminalConventionRatio: Type.Number({ minimum: 0, maximum: 1 }),
    namingOutliers: Type.Array(Type.String()),
    notApplicable: Type.Optional(NotApplicableSchema),
  },
  { additionalProperties: false },
);

const PerRuleFeaturesSchema = Type.Array(
  Type.Object(
    {
      rule: Type.String(),
      alternatives: Type.Integer({ minimum: 0 }),
      rhsItems: Type.Integer({ minimum: 0 }),
      references: Type.Array(Type.String()),
      referencedBy: Type.Array(Type.String()),
      shortestDerivation: Type.Optional(Type.Integer({ minimum: 0 })),
    },
    { additionalProperties: false },
  ),
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
    parseability: ParseabilityFeaturesSchema,
    redundancy: RedundancyFeaturesSchema,
    peg: PegFeaturesSchema,
    operations: OperationsFeaturesSchema,
    style: StyleFeaturesSchema,
    perRule: PerRuleFeaturesSchema,
    notable: NotableFeaturesSchema,
    diagnostics: Type.Array(DiagnosticSchema),
  },
  { additionalProperties: false, $id: "https://gramin.dev/schema/features-v0.5.json" },
);

export type GrammarFeatures = Static<typeof GrammarFeaturesSchema>;
export type NotApplicable = Static<typeof NotApplicableSchema>;
