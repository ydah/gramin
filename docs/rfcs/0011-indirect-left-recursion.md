# RFC 0011: Indirect left-recursive rules

- Status: Accepted
- Date: 2026-11-10

## Summary

Count source rules participating in indirect left recursion, including cycles hidden
behind nullable prefixes. A general dependency cycle alone does not establish left
recursion, and direct-only self recursion is already measured separately.

## Definition

- Output: `structure.indirectLeftRecursiveRules`, an optional nonnegative integer.
- Build the left-corner graph with one node per defined rule. Add `A -> B` when an
  alternative of `A` can reach a reference to defined rule `B` through a nullable
  prefix. Traverse sequences left to right until a nonnullable item; inspect each
  unordered choice branch; descend through groups, optional expressions, stars, and
  pluses. Empty literals and opaque mid-rule actions consume nothing. Terminals,
  character classes, and `anyChar` consume input and stop a sequence prefix.
  Nullability uses the existing least fixed point over source CFG rules.
- Count the union of graph SCCs containing at least two distinct rules. Each rule
  contributes once regardless of cycle count. A direct-only self-loop contributes zero.
  A rule with both direct and indirect cycles contributes to this count as well as the
  existing direct-left-recursion measurement; the metrics are not disjoint.
- Classification: **E**, an exact left-corner graph fact under these CFG semantics.
- Comparison: **B (CFG)**, requiring matching capabilities, especially `ebnfSugar` and
  `scannerless`, and the absence of ordered choice, predicates, and parameterized rules.
  EBNF lowering or inline expansion changes rule identity and can change this count.
- Scope: every rule in the original IR, including rules unreachable from start symbols.
  No parameter instance or synthetic EBNF helper becomes a measured rule.
- Zero: terminal-prefixed mutual recursion, direct-only self recursion, an acyclic
  grammar, and an empty grammar all yield zero.
- Applicability: no analysis option is required. Omit the field and supply
  `structure.notApplicable.indirectLeftRecursiveRules` for `orderedChoice`, `predicates`,
  or `parameterizedRules` source; source capability gates precede the zero check.
  Parameter expansion used by another measurement does not make this one applicable.

For `A: B 'x' | 'a'; B: C; C: A | 'c'`, the result is **3**. For
`A: 'x' B; B: 'y' A`, it is **0**. For
`N: epsilon | 'n'; A: N B | A; B: A`, it is **2**: nullable `N` exposes `B`,
and the direct `A` self-loop does not remove the mutual cycle.

Conservatively require a closed rule-reference set. A referenced external rule, unknown
symbol, or unresolved reference omits the entire count with a reason containing
`undefined rule`, even if that particular reference is behind a consuming prefix.
This avoids claiming an exact zero when omitted definitions could supply nullable
prefixes or edges back into source rules. Unused external declarations do not matter.
Defined rules take precedence over terminal declarations; other declared terminal names
and explicitly classified external terminals consume input. No external rule is assumed
nonnullable, and no partial lower bound is presented as a complete count.

## Determinism and limits

Reuse the existing SCC implementation and expression nullability helper. The integer is
bounded by the number of source rules, with no rounding or ordering requirement. The
left-corner traversal is iterative. There is no new truncation limit; resource exhaustion
fails analysis rather than returning a partial number. Identical IR, source identity,
and options serialize identically.

## Compatibility

Add an optional field to the current feature schema, generated schema, metrics catalog,
coverage manifest, and applicable golden results. Existing feature documents remain
readable and historical schemas keep their definitions. Grammar IR and the meaning of
`directLeftRecursiveRules` are unchanged. Generic reporters and diffs display the scalar;
the computation is internal rather than a new facade API.

## Validation

Handwritten tests cover a three-rule cycle, terminal-prefixed right recursion, nullable
rule prefixes, nonnullable rule prefixes, direct-only self loops, overlapping direct
and mutual cycles, groups, nested choices and sequences, repetitions, actions, unreachable
rules, the empty grammar, all three capability exclusions, and external and unresolved
references. Known zero and unavailable values are tested separately. The result is at
most the number of source rules. No heuristic errors are permitted.

## Alternatives

General dependency SCCs overcount terminal-prefixed right recursion. Looking only at the
first syntactic item misses nullable prefixes and nested choices. Executing a parser or
target-language actions is unnecessary; the existing nullability and SCC machinery gives
the exact source graph fact without those runtime semantics.
