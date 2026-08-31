# RFC 0005: Retain aggregate source metrics

- Status: Accepted
- Date: 2026-08-31

## Summary

Publish Grammar IR 1.3 and Grammar features 0.6 with optional aggregate source statistics.
The Yacc-family frontend records comment size and rule adjacency, selected declaration
counts, explicit `%empty` use, and positional versus named `$` references without retaining
or executing source code.

## Decision

Grammar IR adds optional `sourceMetrics`. Its fields are aggregate counts only. Frontends
that cannot provide a field omit it, and the analyzer records dependent feature fields in
`notApplicable` instead of emitting a misleading zero.

Yacc action scanning counts `$1`, `$$`, typed positional references, `$name`, and
`$[name]` outside ordinary strings and comments. This is a style heuristic, not semantic
action parsing. A comment documents a rule when it ends on the rule's line or immediately
before it.

Features 0.6 exposes the retained declaration, explicit-empty, action-reference, comment,
and documentation measurements. Start-symbol reachability entries also include their
sorted rule sets, and provable PEG prefix shadowing emits
`ANALYZER008_SHADOWED_ALTERNATIVES`.

## Consequences

- Action and comment bodies remain absent from IR and cannot be executed or reconstructed.
- Existing IR 1.x documents remain valid because `sourceMetrics` is optional.
- Non-Yacc frontends remain explicit about unavailable source-backed measurements.
- `grammar-ir-v1.schema.json` stays the stable v1 schema path; features 0.5 remains packaged.
