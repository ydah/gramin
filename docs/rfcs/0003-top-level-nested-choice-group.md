# RFC 0003: Allow groups that preserve nested choices

- Status: Accepted
- Date: 2026-07-25

## Summary

Grammar IR 1.2 permits a `group` directly in `Alternative.items` only when the group's
direct child is `choice`. Frontends still unwrap groups around one expression and flatten
groups around a single sequence.

## Problem

The original canonical rule prohibited all top-level `group` nodes as redundant. Real
ANTLR grammars contain sequences such as `A (B | C) D`. The nested choice cannot be
flattened into `Rule.alternatives` without distributing surrounding items, which can
expand exponentially and destroys the source's nested-choice structure. A direct
`choice` is also prohibited because it loses the explicit grouping boundary.

## Decision

- Permit `group(choice)` directly in `Alternative.items`.
- Continue rejecting `group(symbol)`, `group(seq)`, and all other direct group children.
- Require frontends to unwrap a one-expression group and splice a one-sequence group into
  the surrounding `Alternative.items`.
- Keep `nestedChoiceCount` counting the child `choice` as before.

This is a compatible canonical-form relaxation, published as IR 1.2.0. The JSON document
shape does not change.

## Consequences

- Real EBNF-style nested alternatives remain compact and structurally faithful.
- Redundant parentheses do not introduce frontend-dependent IR shapes.
- External frontend validators built against 1.1 may reject valid 1.2 documents until
  they adopt the relaxed canonical rule.
