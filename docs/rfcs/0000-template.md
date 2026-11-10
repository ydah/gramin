# RFC NNNN: Proposal title

- Status: Proposed
- Date: YYYY-MM-DD

## Summary

State which structural quantity becomes measurable or which existing definition changes.
Explain what users can learn from the result. Diagnostics alone are not a new metric.

## Definition

- Output path and type: name the features field and its numeric, distribution, or set type.
- Counting rule: define the population, unit, inclusions, and exclusions. For ratios, define
  the denominator and empty-population behavior. For percentiles, define the algorithm.
- Classification: choose E for an exact structural fact or H for a heuristic, and explain why.
- Comparison class: choose A, B, or C using the metrics catalog. For B, list the capability
  context that must agree. For C, explain why cross-format comparison is not meaningful.
- Scope: identify the original IR or any derived representation used by the computation.
- Zero: describe an example with a measured zero.
- Applicability: list required capabilities and analysis options. For each unsupported case,
  specify the omitted field and its `notApplicable` reason. Do not substitute zero.

Include a small grammar or IR example and its expected measured values. Explain any
normalization that changes the result. Sharing a language does not establish structural
equivalence across representations.

## Determinism and limits

Define ordering, naming, rounding, and numeric bounds. Show that identical source identity,
IR, and options produce byte-identical serialized features. State deterministic resource
limits and the result when a limit is reached. Avoid partial values that look complete.

## Compatibility

List affected schemas, feature versions, public APIs, reporters, diffs, golden fixtures, and
documentation. Explain how existing feature documents remain readable and how measurements
from different definitions or capability contexts should be compared.

## Validation

List regression examples, boundary cases, applicable invariants, and corpus checks. Include
unsupported cases and at least one test distinguishing a known zero from an unavailable
measurement. Identify any heuristic false positives or false negatives the tests permit.

## Alternatives

Explain simpler approaches considered, why the current behavior is insufficient, and why
this proposal remains within structural measurement rather than parser generation or
target-code execution.

## Open questions

Record decisions still needed before acceptance. Remove resolved questions or incorporate
their answers into the definition when changing the status to Accepted.
