# Grammar features v0.2

The normative machine-readable contract is
`packages/core/schema/features-v0.2.schema.json`. `@gramin/core` exports the schema,
the `GrammarFeatures` TypeScript type, and `validateFeatures`.

The envelope contains the source identity, `featuresVersion`, diagnostics, and the
following sections:

- `size`: symbol, rule, alternative, RHS, nested-choice, and empty-alternative counts;
- `structure`: recursion, SCC, dependency depth, fan-in/out, reachability, and nullability;
- `precedence`: levels, associativity, overrides, and covered terminals;
- `lexicon`: named/literal tokens and scannerless lexical expression counts;
- `sugar`: EBNF and parameterized-rule usage;
- `actions`: action coverage and opaque source-length measures;
- `notable`: concrete rules and symbols that help locate high-impact grammar regions.

A capability-dependent section omits an inapplicable optional metric and records the
reason in its `notApplicable` map. It must not emit a misleading zero or `null`.
For features v0.2 compatibility, required lexicon declaration counts remain present for
scannerless grammars, but `lexicon.notApplicable` directs consumers to
`literalOccurrences`, `charClassCount`, and `anyCharCount`.
