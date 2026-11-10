# RFC 0008: Rule SLR conflict involvement

- Status: Proposed
- Date: 2026-11-10

## Summary

Attribute raw SLR conflict participation to the rules whose LR items supply the
conflicting actions. This identifies where a grammar contributes to an SLR conflict
without changing the existing counts of conflicting state/token cells.

## Definition

Add optional integer `perRule[].slrConflictInvolvement` and optional integer
`parseability.slr.conflictInvolvement.total`. The unit is one distinct LR item in one
conflicting state/token cell. An item is identified by its production occurrence and
dot position; duplicate source alternatives remain distinct productions.

For every canonical LR(0) state, build the existing raw SLR actions for each token.
A cell conflicts when it contains a shift and a reduction, or at least two distinct
reductions. Count each item supplying a SHIFT or REDUCE action to that cell once,
attributing it to the production's left-hand rule. A cell satisfying both conditions
still contributes each item once. Several items supplying the same shift action all
count, although the shift action itself is deduplicated for conflict detection. A
completed item reducing on two FOLLOW tokens counts once in each conflicting cell.
Augmented start items and their ACCEPT actions never contribute.

The aggregate total is the sum of the counts over all concrete grammar rules,
including rules with zero involvement. It is not a count of conflict pairs, actions,
productions, source locations, or distinct rules. Existing `states`,
`shiftReduceConflicts`, and `reduceReduceConflicts` retain their definitions and values.

This is E/B: an exact structural fact for the analyzed representation, comparable
only with the same capability context, terminal identities, start-symbol policy,
normalization, parameter-expansion policy, and definition profiles. Raw SLR analysis
does not apply precedence resolution, construct LALR(1) tables, execute actions, or
compare results with `%expect` declarations.

The domain is the merged plain-BNF grammar used for SLR construction. With parameter
expansion, it includes all concrete instances and EBNF helper rules created by the
expansion policy. Source `perRule` rows remain source rows: zero-arity source rules
receive their concrete counts, templates omit the optional value, and generated rows
are not added. Consequently the aggregate total need not equal the sum of published
source rows. Parseability context records the concrete representation and omission
policy; changing helper structure can change this metric without changing the language.

For `S: A 'x' | 'x'; A: /* empty */`, the initial cell on `'x'` has a shift from
`S -> . 'x'` and a reduction from `A -> .`. The counts are `S = 1`, `A = 1`, and
`total = 2`. For `S: A | B; A: 'x'; B: 'x'`, the completed `A` and `B` items
conflict on end-of-input: `S = 0`, `A = 1`, `B = 1`, and `total = 2`.
A conflict-free grammar measures zero, as does a grammar with no usable start symbol.
An empty grammar has total zero; distribution denominators are specified separately
in [RFC 0009](./0009-slr-involvement-distribution.md).

Applicability is exactly SLR applicability: explicit `{ lr: true }` / `--analysis lr`,
CFG semantics without ordered choice or predicates, completed parameter expansion when
needed, and plain BNF expressions. Missing opt-in, unsupported BNF expressions, or an
unsuccessful expansion omit the entire `slr` object and all per-rule involvement
values, retaining the existing `parseability.notApplicable.slr` reason. These cases
must not emit measured zeros. A missing start retains the existing available zero-state
SLR measurement and therefore emits zero involvement for each concrete rule.

## Determinism and limits

Production order and item identity follow the existing merged-rule and alternative
order. State/token identity and action deduplication remain unchanged. Counts are
nonnegative integers without rounding; Unicode names do not alter item identity.
Identical source identity, IR, and options produce byte-identical serialized features.

The metric adds no resource policy or configurable limits. It uses the existing finite
canonical LR(0) construction, whose state space can be exponential. There is currently
no additional SLR state/work budget. Existing deterministic parameter-expansion limits
apply before this computation; exceeding one omits dependent SLR measurements with its
expansion reason. Never publish a partial involvement count as a complete result.

## Compatibility

The additive optional fields require the current features schema, packaged generated
schema, analyzer output types, JSON/Markdown reporters, metrics catalog, and coverage
documentation to agree. Existing features documents remain readable without the fields;
their absence is not a measured zero. Preserve historical feature schemas and existing
SLR cell-count fixtures. Diff consumers must compare the same definition and capability
context, including derived-grammar metadata, before comparing the new values.

## Validation

Test the two examples above, conflict-free rules, duplicate shift contributors, a cell
with both shift/reduce and reduce/reduce conflicts, reductions on multiple FOLLOW tokens,
multiple starts, no start, an empty grammar, and Unicode rule/token identities. Assert
that aggregate state and conflict-cell counts are unchanged. Distinguish zero from
unavailable values for missing opt-in and unsupported capabilities/expressions. Check
parameter-expanded results against an equivalent concrete grammar while keeping source
templates and generated rules out of source vectors. There are no heuristic false
positives or false negatives under this definition; SLR conflict presence is not a claim
about ambiguity or the parser tables of another algorithm.

## Alternatives

Attributing only reductions would omit rules supplying the conflicting shifts.
Counting distinct actions would lose multiple items behind a shared shift. Counting
conflict pairs would double-count an item when a cell has several competing actions.
Source-level ambiguity diagnostics or generator table comparison would require a
different measurement definition and execution boundary.

## Open questions

Review the item-per-cell unit and the derived-rule domain before acceptance.
