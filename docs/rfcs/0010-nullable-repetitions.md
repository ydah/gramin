# RFC 0010: Nullable repetition operands

- Status: Accepted
- Date: 2026-11-10

## Summary

Measure repetition occurrences whose operands can derive the empty string. This makes
zero-consumption repetition visible without executing predicates, actions, or a parser.

## Definition

- Output: `sugar.nullableRepetitions`, an optional nonnegative integer.
- Count each source `star` or `plus` expression once when its child is CFG-nullable.
  Traverse every rule and expression depth, including unreachable rules and nested
  repetitions. An empty alternative, empty literal, or mid-rule action is nullable;
  `opt` and `star` are nullable; `plus` and `group` inherit their child's nullability;
  a sequence requires every item and an unordered choice requires any alternative.
  Defined rule references use the existing least fixed-point CFG nullability analysis.
- Classification: **E**, an exact structural count under these CFG semantics.
- Comparison: **B (CFG)**. Compare source IR with matching capabilities, especially
  `ebnfSugar`, `scannerless`, and the absence of ordered choice, predicates, and
  parameterized rules. Replacing repetitions with BNF helper rules changes this count.
- Scope: the original IR, never parameter expansion or EBNF lowering. No synthetic
  helpers contribute occurrences, and nesting does not collapse to one occurrence.
- Zero: `S: 'x'*` has zero nullable repetition operands. A plain BNF grammar or an empty
  grammar also has zero: canonical IR with `ebnfSugar=false` cannot contain repetitions,
  so this measurement is available even though the older sugar occurrence fields omit
  themselves for that capability.
- Applicability: no analysis flag is required. Omit the field and supply
  `sugar.notApplicable.nullableRepetitions` for `orderedChoice`, `predicates`, or
  `parameterizedRules` source. Capability gates precede the zero-occurrence check;
  parameter expansion does not replace the source scope.

For `N: epsilon | 'x'; S: N* N+ 'x'*`, the result is **2**. For
`S: (('')+)* ('x'*)+`, it is **3**: both repetitions in the first expression are
counted, and the outer plus in the second is counted.

Referenced external rules, unknown symbols, and unresolved references do not supply
their nullability. Conservatively omit a complete count when any such reference occurs
and the grammar contains a repetition; the reason contains `undefined rule`.
Defined rule names take precedence over terminal declarations. Otherwise declared
terminal names and external symbols explicitly classified as terminals consume input.
Unused external declarations do not affect applicability. With no repetitions the
empty count is still exactly zero, even if references are unresolved.

## Determinism and limits

The result is an integer bounded by the number of source `star` and `plus` occurrences.
It needs no ordering or rounding. The existing expression walker and least fixed point
are reused; no new truncation limit or partial result is introduced. Identical IR,
source identity, and options serialize identically. Resource exhaustion remains an
analysis failure rather than a numeric result.

## Compatibility

Add an optional field to the current feature schema, generated schema, metrics catalog,
coverage manifest, and applicable golden results. Existing feature documents remain
readable; historical schemas retain their definitions. Grammar IR is unchanged. Existing
generic reporters and diffs can display the scalar without a new public analyzer API.

## Validation

Handwritten tests cover nullable references, empty literals, nested repeats, sequences,
groups, choices, optional operands, nonnullable operands, empty and plain BNF grammars,
all three capability exclusions, unresolved references, external rules, terminal
references, and known zero versus unavailable. The count cannot exceed `star + plus`
when those source occurrence fields are available. No heuristic errors are permitted.

## Alternatives

Counting repetitions alone cannot distinguish zero-consumption operands. Counting only
nullable rule references misses inline epsilon and optional operands. Lowering EBNF
loses source occurrence identity. Simulating repetition is unnecessary for this exact
structural measurement.
