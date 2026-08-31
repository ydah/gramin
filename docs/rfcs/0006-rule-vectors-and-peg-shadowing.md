# RFC 0006: Complete rule vectors and PEG shadow classification

- Status: Accepted
- Date: 2026-08-31

## Summary

Publish Grammar features 0.7 with rule-local parseability and graph facts, and separate
provable PEG shadowing from symbol-expanded heuristic candidates. Grammar IR remains 1.3.

## Decision

Each `perRule` record adds maximum RHS width, maximum expression depth, fan-in, fan-out,
start symbols that reach the rule, unit-rule count, and—when CFG analysis applies—FIRST
and FOLLOW sizes plus LL(1) conflict counts. These reuse the same computations as the
aggregate sections and remain independent facts rather than a composite score.

`peg.shadowedAlternativePairs` retains its exact structural-prefix meaning and diagnostic.
`peg.potentialShadowedAlternativePairs` expands leading literal sets through rule
references and is explicitly heuristic; it does not emit a diagnostic.

List-recursion classification now requires a non-recursive base alternative and a
list-like rule name. This avoids presenting every left-recursive expression rule as a
probable list while preserving the metric's H/C classification.

## Consequences

- Reporters can rank and filter rules without re-analyzing Grammar IR.
- Potential cross-rule PEG hazards are visible without weakening the exact diagnostic.
- Features 0.6 remains packaged for existing consumers.
