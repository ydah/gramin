# RFC 0004: Add contextual structural features

- Status: Accepted
- Date: 2026-07-27

## Summary

Publish Grammar features 0.3 with the Grammar IR capabilities required to interpret a
measurement, percentile summaries for rule size, reachable recursion measurements,
precedence-shape measurements, and action counts guarded by an explicit completeness
state.

Grammar IR remains at 1.2.0. Every new feature is derived from the existing canonical IR.

## Problem

Measurements that are mechanically exact for one IR document can still be misleading when
their representation or source coverage is hidden:

- authored Yacc, ANTLR, and Peggy fixtures for the same JSON start language contain
  different rule, alternative, and dependency-graph shapes because EBNF, scannerless
  expressions, lexer separation, and helper rules are represented differently;
- the existing recursive-SCC measurements intentionally include only components with two
  or more rules, so a grammar can contain direct self-recursion while reporting zero such
  components;
- ANTLR and Peggy frontends diagnose omitted actions with `IR010_LOSSY_ACTION`, but the
  required features 0.2 action fields still contain zero or lower-bound measurements;
- averages and maxima expose neither the typical rule nor the upper tail in the large Perl,
  Ruby, and PHP grammars.

The features document did not copy Grammar IR capabilities. Reporters therefore had to
infer applicability from values or branch on a source format, contrary to the
format-independent Analyzer and Reporter boundary.

## Decision

### Capability context

Features 0.3 includes the Grammar IR `capabilities` object unchanged. It describes the
representation context in which class-B measurements must be interpreted. Reporters use
these flags and `notApplicable` entries, never source-format branches, for metric
interpretation.

### Size distributions

`size.altPerRulePercentiles` and `size.rhsLengthPercentiles` contain `p50` and `p95`.
Percentiles use the deterministic nearest-rank definition: sort the `n` integer
observations and select the one-based item at `ceil(p * n)`. The objects are omitted for an
empty sample and their absence is explained in `size.notApplicable`.

`p90` is deliberately not emitted. The median and upper-tail percentile complement the
existing average and maximum without adding three adjacent thresholds that are unstable
and redundant for small grammars.

### Reachable recursion

The existing `recursionSccCount` and `largestSccSize` retain their features 0.2 meaning:
they describe mutually recursive components containing at least two rules.

The following measurements are additive:

- `reachableRules`: rules reachable from at least one start symbol;
- `recursiveRules`: reachable rules in either a multi-rule SCC or a singleton SCC with a
  self-edge, with a ratio over reachable rules;
- `largestRecursiveComponent`: the largest such reachable component, with sorted members
  and a ratio over reachable rules.

When there are no reachable rules, counts remain zero, ratios are omitted, and
`structure.notApplicable` explains the zero denominator.

### Precedence shape

For grammars with `precedenceTable` capability, features 0.3 adds:

- `maxTokensPerLevel`;
- `rulesWithPrecOverrides`;
- `precOverrideAlternativeRatio`, using every top-level alternative as the denominator.

The fields are omitted with reasons when the capability is false.

### Action completeness and counts

`actions.completeness` is `partial` when Grammar IR diagnostics contain
`IR010_LOSSY_ACTION`; otherwise it is `complete`. Frontends are already required to
diagnose intentional source loss.

When completeness is `complete`, features include `trailingActions`, `totalActions`, and
`rulesWithActions`. A mid-rule action and a trailing action each contribute one to the
total. When completeness is `partial`, these new counts are omitted and
`actions.notApplicable` explains the omission.

The required features 0.2 action fields remain for minor-version compatibility. Reporters
must not present them as complete measurements when `actions.completeness` is `partial`.
No new action-length totals or percentiles are introduced because length is
formatting-sensitive and the existing IR does not define a cross-frontend byte unit.

## Versioning

This is an additive features change, so set `featuresVersion` to `0.3.0` and publish
`features-v0.3.schema.json`. Keep the packaged `features-v0.2.schema.json` artifact for
existing consumers.

No existing metric changes meaning. Grammar IR stays at 1.2.0 because all measurements and
applicability decisions use existing fields, capabilities, and diagnostics.

## Consequences

- Consumers can determine comparison context without knowing frontend or format names.
- Self-recursive and mutually recursive reachable regions share one explicit measurement.
- Large-grammar summaries expose typical and tail sizes without emitting full
  distributions.
- Lossy action parsing no longer appears as a trustworthy zero in human or LLM reports.
- Semantic-type coverage, error-recovery normalization, source byte counts, terminal
  rankings, and parser-generator conflict results remain out of scope until their
  completeness and common semantics can be represented.
