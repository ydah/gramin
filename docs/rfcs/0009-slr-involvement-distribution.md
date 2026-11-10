# RFC 0009: SLR involvement distribution

- Status: Proposed
- Date: 2026-11-10

## Summary

Describe how widely the item-per-cell involvement from
[RFC 0008](./0008-rule-slr-conflict-involvement.md) is spread across concrete rules.
Publish the involved-rule count, ratio, and nearest-rank median and 95th percentile.

## Definition

Add the following optional fields inside `parseability.slr.conflictInvolvement`:

- `involvedRules`: nonnegative integer count of concrete rules whose involvement is
  greater than zero.
- `ruleRatio`: `involvedRules / N`, rounded to four decimal places, where `N` is the
  number of concrete rules in the SLR grammar, including zero-valued rules.
- `percentiles`: integer `{ p50, p95 }` from the involvement counts of all `N` concrete
  rules, including zeros. Sort values numerically and select the one-based element at
  `ceil(p * N)` for `p = 0.5` and `p = 0.95`, without interpolation.

`involvedRules` is required whenever the parent involvement object is emitted. Ratio
and percentiles are omitted for `N = 0`. Record `"grammar has no rules"` under both
`parseability.notApplicable["slr.conflictInvolvement.ruleRatio"]` and
`parseability.notApplicable["slr.conflictInvolvement.percentiles"]`. The available
`total = 0` and `involvedRules = 0` remain present; no undefined denominator becomes
a false zero ratio or a false zero percentile.

These are E/B measurements: exact for the specified sample and rounding policy,
comparable only under the same SLR capability and representation context as RFC 0008.
The domain includes unreachable concrete rules, concrete parameter instances, and any
EBNF helper rules created by parameter expansion. It excludes uninstantiated templates.
The sample therefore need not equal the published source `perRule` rows. Reporters and
comparisons must use parseability's derived context when present. Helper normalization
can change the ratio and percentiles while preserving the recognized language.
These fields do not apply precedence resolution or compare raw SLR conflicts with
`%expect`, LALR(1), or generated parser behavior.

For `S: A | B; A: 'x'; B: 'x'`, the involvement sample is `[0, 1, 1]`:
`total = 2`, `involvedRules = 2`, `ruleRatio = 0.6667`, `p50 = 1`, and `p95 = 1`.
For one conflict-free concrete rule the sample is `[0]`, giving `involvedRules = 0`,
`ruleRatio = 0`, and both percentiles zero. With nonempty rules but no usable start,
the existing SLR state count and all involvement samples are available zeros. With no
rules, the ratio and percentile fields are unavailable as specified above.

SLR opt-in, CFG capability gates, successful parameter expansion, and plain BNF are
required. If SLR is unavailable, omit its entire object, including this distribution,
and keep the existing `parseability.notApplicable.slr` reason. Do not separately label
those absent child fields as empty populations. Empty-population reasons apply only
when SLR itself is available and the concrete rule domain is empty.

## Determinism and limits

The sample is independent of rule-name ordering, including Unicode spelling. Use the
existing numeric nearest-rank and four-decimal rounding functions. Counts and
percentiles are nonnegative integers; the ratio lies in `[0, 1]`. For nonempty samples,
`min <= p50 <= p95 <= max`, `0 <= involvedRules <= N`, and `involvedRules = 0` exactly
when total is zero. Identical source identity, IR, and options serialize identically.

No new dependency, sampling approximation, configurable budget, or elapsed-time cutoff
is introduced. Existing parameter-expansion limits and the current SLR construction's
resource limits apply as described in RFC 0008. An incomplete derived grammar or SLR
construction must never yield a partial distribution that looks complete.

## Compatibility

Update the current features schema and packaged artifact, analyzer types and computation,
reporter output, metrics catalog, and coverage alongside RFC 0008. Optional fields keep
historical features documents readable. Old missing values cannot be compared as zeros;
future diffs must check definition and capability context, including helper policy and
library profiles. Preserve historical schemas and existing state/conflict-cell values.

## Validation

Test the `[0, 1, 1]` oracle and a nonempty all-zero sample, an empty grammar with both
precise `notApplicable` keys, no starts, Unicode names, and unavailable SLR. Test a
larger skewed sample to distinguish all-rule percentiles from involved-only percentiles
and to exercise nearest-rank p50 and p95. Assert the total/per-rule sum on concrete
grammars and the bounds above. Parameter-expanded fixtures must sample every concrete
helper while preserving the source-vector omission policy. No heuristic uncertainty is
permitted for these arithmetic results.

## Alternatives

Sampling only involved rules hides the size of the unaffected grammar and biases both
percentiles upward. Sampling only published source rows loses concrete template/helper
participation. Reporting only a total cannot distinguish concentrated from widespread
involvement. A histogram or ranked list would add output beyond the initial question.

## Open questions

Review the all-concrete-rule sample and empty-domain omission contract before acceptance.
