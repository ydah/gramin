# RFC 0002: Preserve ordered rule alternatives

- Status: Accepted
- Date: 2026-07-25

## Summary

Add optional `Rule.orderedAlternatives: true` in Grammar IR 1.1.0. It states that the
rule's alternatives are tried in source order and the first success commits, as in PEG.

## Problem

The canonical form correctly flattens a choice directly below a rule into
`Rule.alternatives`. This preserves CFG choice, but the rule container had no way to
distinguish unordered alternatives from PEG ordered choice. Wrapping the choice in a
`group`, `opt`, or another expression would either violate canonical form or change the
grammar.

## Decision

- A frontend sets `orderedAlternatives: true` on rules whose top-level alternatives are
  ordered.
- The field is omitted for unordered rules; `false` is accepted but producers should
  prefer omission.
- `capabilities.orderedChoice` is true when any rule has ordered alternatives or any
  nested `choice` node has `ordered: true`.
- `nestedChoiceCount` continues to count expression nodes only; ordered top-level
  alternatives remain part of the ordinary alternative count.

This is an additive IR v1 minor change. Set the current producer version to 1.1.0 and keep
Analyzer 1.x compatible with 1.0 documents where the field is absent.

## Consequences

- PEG choice semantics survive canonical top-level flattening.
- Existing frontends and v1.0 consumers remain structurally compatible.
- CFG-only analysis is disabled by the existing `orderedChoice` capability mechanism.
- Consumers that interpret alternatives operationally must inspect the new rule field.
