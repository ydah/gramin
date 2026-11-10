# Feature diffs

`diffFeatures(before, after, options?)` compares validated `GrammarFeatures` documents.
It returns the reporter-owned `FeatureDiff` TypeScript contract; it does not change the
core features schema or recalculate measurements. JSON and Markdown reporters expose the
same result. Existing `changes`, `regressions`, and optional `structural` fields remain.

## Rule changes

Source `perRule` records match by exact rule name, independently of array position.
Added and removed rules appear as whole-row structural events. Shared rules have
individual changed fields, such as `/perRule/expr/fanOut` and
`/perRule/expr/ll1Conflicts/total`. A rename is a removal and an addition; the diff does
not infer identity from similar bodies. Generated parameter instances and EBNF helpers
remain outside these source rows.

Paths escape `~` as `~0` and `/` as `~1` in each segment. Rule names and object keys use
UTF-8 byte order, so reordering source vectors creates no changes. Other arrays retain
their existing whole-value comparison. Source-to-source comparisons can additionally
supply both IRs for normalized rule-tree edit distance and dependency blast radius.
Feature documents alone cannot provide that structural analysis.

## Comparable measurements

Changed numeric metrics, numerical metric collections, and tracked issue lists enter
`changes` only when their measurement contexts match. An unavailable field or a retained
legacy value marked in `notApplicable` is never treated as zero. A suppressed comparison
appears in optional `notComparable` as `{ path, class, reason }`, without numeric before
or after values. Markdown renders these entries under “Not comparable.” If nothing is
skipped, the optional field is absent.

The [metrics catalog](./metrics-catalog.md) supplies each comparison class. Rule-local
fields use their corresponding aggregate metric's class and context.

- All numeric comparisons require exactly matching `featuresVersion` strings and
  available values on both sides. Version differences can change definitions.
- Class A permits comparisons across source formats and capability contexts, subject
  to the availability requirement.
- Class B conservatively requires matching source capabilities. FIRST/FOLLOW, LL(1),
  SLR, and their local fields instead use the derived parseability context when present.
  Both sides must use the same representation, effective capabilities, and limits.
  A source-domain result and a derived-domain result are not comparable even when their
  source capability objects match.
- Class C permits a descriptive within-context delta only when source format, dialect,
  and capabilities match. This includes action counts, declared conflict expectations,
  and heuristic values. It does not make a heuristic exact or justify cross-format
  ranking. A declared `%expect` count is never compared with measured SLR conflicts.

`parseability.context` is metadata. Its source/concrete rule counts, instance/helper
counts, and omitted template names describe the measured sample and are excluded from
comparison identity. These metadata changes remain visible. Source structural, sugar,
shortest-derivation, and unit-rule values continue to use their source domain; derived
context does not enable unavailable source measurements. Missing local CFG values stay
unavailable even when the aggregate concrete measurement exists.

## Regression policy

The existing tracked metric increases, issue-list growth, and newly introduced warning
or error diagnostics remain review-policy regressions. Incompatible metric comparisons
cannot trigger a numeric regression. New local field differences and row additions are
visible changes without automatically becoming failures. A regression is not proof of
semantic deterioration, ambiguity, or changed parser-generator behavior.

Callers that gate on `regressions.length` keep the same API. Consumers should also display
`notComparable` so skipped measurements are explained. Validate feature files through
the public core validator before calling the typed reporter API.
