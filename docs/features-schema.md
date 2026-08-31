# Grammar features v0.7

The current producer version is 0.7.1.

The normative machine-readable contract is
`packages/core/schema/features-v0.7.schema.json`. `@gramin/core` exports the schema,
the `GrammarFeatures` TypeScript type, and `validateFeatures`.
The previous feature schemas remain packaged for
existing consumers.

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
- `parseability`: CFG FIRST/FOLLOW distributions, LL(1) conflicts, and unit-rule cycles;
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

Features 0.7 expands each `perRule` vector with local parseability, graph, reachability,
width, and depth facts; separates symbol-expanded potential PEG shadowing from provable
shadowing; and narrows list-recursion classification. CFG-only fields are omitted for
ordered-choice, predicate-bearing, and unexpanded parameterized grammars; SLR construction
is emitted only when requested. Features 0.6
remains packaged for consumers that need the previous contract. See
[`RFC 0006`](./rfcs/0006-rule-vectors-and-peg-shadowing.md).
