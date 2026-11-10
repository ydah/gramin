# Grammar features v0.8

The current stable producer version is 1.0.0.

The normative machine-readable contract is
`packages/core/schema/features-v1.schema.json`. `@gramin/core` exports the schema,
the `GrammarFeatures` TypeScript type, and `validateFeatures`.
The previous feature schemas remain packaged for
existing consumers.

The envelope contains the source identity, Grammar IR `capabilities`, `featuresVersion`,
diagnostics, and the following sections:

- `size`: symbol, rule, alternative, RHS, percentile, nested-choice, and
  empty-alternative measurements;
- `structure`: direct, indirect left, mutual, and reachable recursion, dependency depth,
  fan-in/out, reachability, nullability, and productive-rule analysis;
- `precedence`: levels, associativity, override usage, per-level shape, and covered
  terminals;
- `lexicon`: named/literal tokens and scannerless lexical expression counts;
- `sugar`: EBNF and parameterized-rule usage, including nullable repetition operands;
- `actions`: completeness, action counts, coverage, and opaque source-length measures;
- `parseability`: CFG FIRST/FOLLOW distributions, LL(1) conflicts, source unit-rule cycles,
  declared conflict expectations, and optional raw SLR conflict involvement;
- `redundancy`: common prefixes, duplicate alternatives, clones, and unused declarations;
- `peg`: predicates, shadowed choices, backtracking hotspots, and character-class overlap;
- `operations`: error recovery, declaration use, explicit-empty style, and named references;
- `style`: naming consistency, comment density, and rule-documentation coverage;
- `perRule`: stable rule-level vectors for downstream review and comparison;
- `notable`: concrete rules and symbols that help locate high-impact grammar regions.

A capability-dependent section omits an inapplicable optional metric and records the
reason in its `notApplicable` map. It must not emit a misleading zero or `null`.
Required legacy fields can remain present for minor-version compatibility, but a matching
`notApplicable` entry tells consumers not to interpret their placeholder or partial value.
This applies to scannerless declaration counts and to features 0.2 action measurements
when `actions.completeness` is `partial`.

Features 0.8 adds source CFG nullable-repetition and indirect-left-recursion counts,
declared conflict expectations, rule SLR involvement, and its aggregate distribution.
It also analyzes finite parameterized grammars through an internal concrete BNF view.
Historical schemas, including features 0.7, retain their original contracts.

## Source SCC distribution

`structure.sccSizeHistogram` records the complete source dependency SCC partition
as ascending `{size, count}` bins. Both values are positive integers. Every source
rule belongs to one component, including unreachable rules, singleton components,
self-loops, and parameterized source definitions. Thus `sum(size * count)` equals
the distinct source-rule count. An empty grammar records `[]`; older feature
documents may omit the field. Unlike the legacy mutual-only `largestSccSize`, this
histogram includes all components. Its comparison class is E/B under matching
source capabilities, and it requires no CFG interpretation or LR option.

## Source and concrete grammar domains

Top-level `capabilities` remains the unchanged source IR context. Source size,
structure, sugar, unit-rule metrics, and structural `perRule` values keep their source
meaning. `sugar.nullableRepetitions` and `structure.indirectLeftRecursiveRules` require
source CFG semantics; parameter expansion does not make them applicable.

When parameter expansion succeeds, `parseability.context` describes the concrete
domain used by FIRST/FOLLOW, LL(1), and requested SLR measurements:

- `representation`: `parameter-expansion-bnf-v1`;
- `sourceRules`, `concreteRules`, `parameterInstances`, and `ebnfHelpers`: domain sizes;
- `omittedTemplateRules`: source templates that have no single concrete rule vector;
- `effectiveCapabilities`: capabilities of the derived plain CFG, with ordered choice,
  predicates, parameterized rules, and EBNF sugar false;
- `limits`: `instances: 10000`, `nodeVisits: 1000000`, `depth: 256`, and
  `keyBytes: 8388608`. The generated-rule limit covers instances and EBNF helpers.

These fields are metadata, not metrics. Comparison identity uses the representation
policy, effective capabilities, and limit policy; domain counts and omitted template
names describe the sample and are not identity keys. The current analyzer expands local
definitions. Missing external or standard-library bodies omit dependent results with
reasons; a public versioned library-definition transport remains open.

The concrete domain contains every zero-arity source rule, all instances they require,
and deterministic EBNF helpers. Generated rules never become source `perRule` rows.
Source zero-arity rows receive their concrete FIRST/FOLLOW, LL(1), and requested SLR
involvement values; templates omit those optional fields. Consequently aggregate
concrete measurements need not equal sums over published source rows.

`parseability.slr.conflictInvolvement` contains `total`, `involvedRules`, and, for a
nonempty concrete domain, `ruleRatio` and nearest-rank `percentiles`. Its sample includes
zero-valued and unreachable concrete rules. An empty domain retains zero counts and
omits ratio and percentiles with precise `notApplicable` entries. Missing SLR opt-in or
unsupported semantics omit the whole SLR object and local involvement values.

`parseability.declaredConflicts` copies accepted global source expectations independently
of SLR availability. Missing declarations are unavailable, not zero; these values are
never compared with measured raw SLR conflict cells.

See [RFC 0007](./rfcs/0007-expand-parameterized-rules-for-parseability.md) through
[RFC 0012](./rfcs/0012-declared-conflict-expectations.md) and the
[metrics catalog](./metrics-catalog.md) for the counting definitions.
