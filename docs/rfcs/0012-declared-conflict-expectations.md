# RFC 0012: Declared conflict expectations

- Status: Accepted
- Date: 2026-11-10

## Summary

Capture global Yacc-family `%expect` and `%expect-rr` declarations as source facts.
Expose their declared counts independently of the optional SLR analysis, without
interpreting them as measured conflicts or comparing them with raw SLR counts.

## Definition

- IR: optional `expectedConflicts`, with optional `shiftReduce` and `reduceReduce`
  counts. `%expect N` supplies `shiftReduce`; `%expect-rr N` supplies `reduceReduce`.
- Features: optional `parseability.declaredConflicts`, with the same shape.
- Classification: **E**, exact capture of accepted global source declarations.
  These values describe the author's expectations, not parser behavior.
- Comparison: **C**, source declaration conventions must match. Generator family,
  parser mode, precedence resolution, and the meaning of generator conflict reports
  may differ. The counts do not establish LALR, IELR, canonical LR, or GLR behavior.
- Each present count is a nonnegative safe integer. Zero is present data; omission
  means no valid captured declaration. Neither object may be empty, and both reject
  unknown properties.
- Capture only declarations before the first `%%`, outside preamble rule bodies.
  Rule-local `%expect` and `%expect-rr` annotations retain existing unsupported-rule
  diagnostics and never supply a global count. Following rules remain parseable.
- For each kind independently, any duplicate declaration emits an error and removes
  that count. This includes identical duplicates and declarations after an invalid
  value. An invalid negative, fractional, unsafe, missing, or malformed value emits
  an error and removes that kind. Later declarations cannot restore it. A valid
  declaration of the other kind is retained.
- Capture works without an LR analysis flag and remains available when SLR analysis
  is unavailable. If the IR has no accepted captured declaration, omit the feature
  and explain it through `parseability.notApplicable.declaredConflicts`; never use a
  default zero.

For `%expect 0` and `%expect-rr 2`, both IR and features preserve
`{ shiftReduce: 0, reduceReduce: 2 }`. A grammar without declarations has no object.
`%expect 1` followed by `%expect 1` has no shift/reduce count and produces
`YACC104_DUPLICATE_CONFLICT_EXPECTATION`. Invalid values produce
`YACC103_INVALID_CONFLICT_EXPECTATION`.

## Determinism and limits

Use the existing declaration token stream and carry the accepted values through the
AST and lowering. Decimal digit tokens must form exactly one integer value; signs,
fractions, extra values, and values above `Number.MAX_SAFE_INTEGER` are invalid.
No rounding, truncation, generator execution, or additional resource limit applies.
Identical source, source identity, and analysis options serialize identically.

## Compatibility

The optional IR field is an additive minor update from 1.3.0 to 1.4.0. Preserve the
exact previous `grammar-ir-v1.schema.json` bytes as `grammar-ir-v1.3.schema.json`
before regenerating the current schema. Older IR without the field remains valid.
Add the optional feature to the unreleased features 0.8.0 schema, metrics catalog,
coverage manifest, reporter output, and applicable golden results. Historical
feature schemas remain unchanged.

## Validation

Handwritten tests cover actual frontend AST and IR capture, absent declarations,
zero and positive counts, each kind independently, malformed and unsafe values,
duplicate and invalid-then-valid declarations, rule-local annotations, and recovery
to following rules. Schema tests reject negative, fractional, unsafe, empty, and
unknown-property objects at IR and feature boundaries. Canonical serialization
round trips preserve zero and two. Feature tests cover LR disabled and unavailable
while retaining the existing not-applicable reasons.

## Alternatives

Inferring zero from omission loses the difference between an explicit expectation
and missing source information. Comparing declarations with raw SLR counts mixes
different parser algorithms and ignores generator resolution. Choosing the first
or last duplicate arbitrarily hides malformed source. Executing a generator is
outside this source-capture metric.
