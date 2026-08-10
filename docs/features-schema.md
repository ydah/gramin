# Grammar features v0.4

The normative machine-readable contract is
`packages/core/schema/features-v0.4.schema.json`. `@gramin/core` exports the schema,
the `GrammarFeatures` TypeScript type, and `validateFeatures`.
The previous `features-v0.2.schema.json` remains packaged for existing consumers.

The envelope contains the source identity, Grammar IR `capabilities`, `featuresVersion`,
diagnostics, and the following sections:

- `size`: symbol, rule, alternative, RHS, percentile, nested-choice, and
  empty-alternative measurements;
- `structure`: direct, mutual, and reachable recursion, dependency depth, fan-in/out,
  reachability, nullability, and productive-rule analysis;
- `precedence`: levels, associativity, override usage, per-level shape, and covered
  terminals;
- `lexicon`: named/literal tokens and scannerless lexical expression counts;
- `sugar`: EBNF and parameterized-rule usage;
- `actions`: completeness, action counts, coverage, and opaque source-length measures;
- `notable`: concrete rules and symbols that help locate high-impact grammar regions.

A capability-dependent section omits an inapplicable optional metric and records the
reason in its `notApplicable` map. It must not emit a misleading zero or `null`.
Required legacy fields can remain present for minor-version compatibility, but a matching
`notApplicable` entry tells consumers not to interpret their placeholder or partial value.
This applies to scannerless declaration counts and to features 0.2 action measurements
when `actions.completeness` is `partial`.

Features 0.4 adds exact `structure.unproductiveSymbols` and the corresponding
`ANALYZER006_UNPRODUCTIVE_RULES` diagnostic. Features 0.3 remains packaged for consumers
that need the previous contract. The preceding changes are defined by
[`RFC 0004`](./rfcs/0004-contextual-structural-features.md).
