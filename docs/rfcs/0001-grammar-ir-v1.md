# RFC 0001: Stabilize Grammar IR v1

- Status: Accepted
- Date: 2026-07-25

## Summary

Promote Grammar IR 0.2 to 1.0 without changing its document shape. The BNF/EBNF
implementation validated the existing expression union, and the external frontend
exercise validated the schema plus canonical-form boundary. Version 1 therefore marks
the tested contract stable rather than introducing speculative fields.

## Evidence from Phase 3

BNF alternatives map directly to `Rule.alternatives`. Parenthesized nested alternatives
use `group(choice)`, concatenation uses `seq` only below a sugar or group node, and `[]`,
`{}`, and postfix operators map to `opt`, `star`, and `plus`. No Analyzer representation
special case was needed.

The only implementation friction was preserving parentheses around a nested choice while
still forbidding a top-level group. That distinction is already stated by the canonical
rules and is mechanically validated.

An external Python implementation could produce the same features as the in-process BNF
frontend using only the JSON contract. Deliberately inconsistent capability flags were
rejected before analysis.

## Contract

- Set current `irVersion` to `1.0.0`.
- Publish `grammar-ir-v1.schema.json` with a v1 schema identifier.
- Keep the complete 0.2 schema artifact in the core package for existing producers.
- Keep the v1 document shape and canonical rules identical to 0.2.
- Future compatible additions increment the v1 minor version. Removal, narrowing, or
  semantic reinterpretation requires IR v2.

## Migration

All bundled frontends emit v1 immediately and all committed golden fixtures use v1.
Analyzer 1.x accepts structurally compatible v0.x input and adds
`ANALYZER005_LEGACY_IR_VERSION`. It accepts future v1 minor versions with
`ANALYZER004_FUTURE_IR_MINOR` because the schema is additive by policy.

Support for v0.x will be removed no earlier than Analyzer 2.0. External frontends should
switch their emitted version to 1.0.0 and verify output with `gramin validate-ir`.

## Alternatives

Adding source-format-specific fields was rejected. Lrama parameters, BNF sugar, ordered
choice, predicates, and scannerless nodes already have format-neutral representations.
Holding the contract at 0.x until every planned frontend exists was also rejected:
ANTLR, PEG, and Menhir rely on union members already exercised by the schema and may
motivate additive v1 minors without preventing a stable baseline.
