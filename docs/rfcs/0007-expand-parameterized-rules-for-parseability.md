# RFC 0007: Expand parameterized rules for parseability

- Status: Proposed
- Date: 2026-11-10

## Summary

Build a finite, concrete grammar for FIRST/FOLLOW, LL(1), and optional raw SLR
measurements when Grammar IR contains parameterized rules. Keep the input IR and
source-based measurements unchanged. Record the derived representation and its limits
with the measurements. If expansion cannot finish with known definitions, omit the
dependent measurements and explain why in `notApplicable`.

This RFC proposes behavior; it does not describe an implemented expansion API or schema.

## Problem and current contract

[Grammar IR 1.3](../ir-schema.md) already represents definitions through `Rule.params`
and applications through `symbol.args`. Arguments are expression trees, so applications
can be nested. A formal reference uses an ordinary `symbol` node. `isInline` is retained
separately. The input capability `parameterizedRules` must reflect these nodes exactly.

The Yacc and Menhir frontends retain parameterized definitions and calls. Their standard
library modules currently list recognized names, not bodies or arities. A recognized
call without a local definition becomes an `externalSymbols` entry with `origin:
"stdlib"` and `kind: "rule"`. That declaration does not establish what the rule derives.

The analyzer currently omits FIRST/FOLLOW, LL(1), and SLR measurements whenever
`parameterizedRules` is true. It still measures source unit rules and unit cycles.
Parameterized grammars also lack CFG nullability, productivity, and shortest derivation
in `structure`. This proposal only changes the parseability measurement path. In
particular, Ruby's pinned `parse.y` should become measurable without replacing its
source grammar with generated helper rules throughout the features document.

## Measurement definition and scope

The measurement domain is every zero-arity source rule, including unreachable rules,
plus every concrete parameterized instance required by those rules. Keep the declared
start symbols; each must identify a zero-arity rule. Uncalled templates have no concrete
instance and do not contribute a sample. This preserves the existing all-rule domain
for grammars without parameters while making the changed domain explicit.

On a complete expansion:

- Compute `parseability.firstSetSize` and `followSetSize` over all concrete rules in that
  domain, using the existing cardinality, ranking, rounding, and percentile definitions.
- Compute `parseability.ll1Conflicts` over alternative pairs within those concrete rules,
  using the existing FIRST/FIRST and FIRST/FOLLOW definitions.
- When `--analysis lr` is requested and the concrete expressions are plain BNF, compute
  `parseability.slr` with the existing canonical LR(0) and raw SLR definitions.

These measurements are E/B: exact for the declared concrete representation, comparable
only with the same expansion policy, definition profiles, and capability context. They
are not heuristics. Introducing a helper rule or changing a library definition can
change distributions, LL(1) conflicts, and LR(0) states without changing the language.
The results do not reproduce Lrama or Menhir parser tables. Precedence resolution,
LALR(1), and comparisons with `%expect` remain outside the definition.

Use nullability of the concrete grammar internally for FIRST/FOLLOW and LL(1). Do not
publish it as source `structure.nullableRules`. Keep all existing source-based fields on
the original IR: size, structure, sugar, precedence, lexicon, actions, operations, style,
redundancy, PEG facts, notable locations, and structural parts of `perRule`.
`parseability.unitRules`, `cyclicUnitRules`, and their diagnostics also retain their
existing source meaning; their interpretation does not switch to the concrete grammar.

Keep `perRule` rows keyed by source rule names. Zero-arity source rules can receive their
concrete FIRST/FOLLOW and LL(1) values. Omit those optional values for templates: several
instances cannot be collapsed into one source-rule value under the existing definition.
Do not add generated rules to source vectors or attach one arbitrary instance's values
to a template. Metadata must explain this omission. Exposing instance vectors would need
a separate output decision.

## Expansion boundary

The analyzer consumes a derived grammar without mutating, serializing over, or returning
it as the frontend's IR. Frontends remain responsible for parsing and resolving terminal
aliases. Expansion operates on IR expressions and explicit rule definitions, never by
running a parser generator, semantic action, predicate, or target-language code.

### Definitions, binding, and substitution

1. Index local definitions by name. A local rule takes precedence over a library rule
   with the same name. Reject duplicate formal names and incompatible parameter lists
   among repeated declarations still present in the supplied IR. Existing frontend
   merging cannot recover inconsistencies it has already discarded.
2. Treat absent `params` and an empty parameter list as arity zero. A reference to a
   parameterized definition must supply exactly its arity; a call to a zero-arity rule
   must supply no arguments. Treat absent and empty `args` equivalently for this check.
   An arity mismatch prevents the affected expansion from completing.
3. A formal binds symbol references in its own rule body, including references inside
   application arguments. It shadows a global rule of the same name in that scope.
   Resolve each actual argument in the caller's environment before substituting it.
   Substitute simultaneously; do not reinterpret inserted expressions as references to
   the callee's formals. This prevents accidental capture.
4. Replace a formal reference with its argument expression, then expand applications
   found in the substituted body. Preserve alternative order and multiplicity. Restore
   the canonical sequence/group shape where substitution inserts a sequence. Do not
   distribute choices or invent EBNF lowering as part of parameter substitution.
5. Applying a formal as a constructor, such as `F(X)` where `F` is itself a formal, is a
   higher-order application. The initial proposal reports it as unsupported rather than
   guessing how an arbitrary expression becomes a callable definition. Ordinary nested
   applications such as `list(option(expr))` remain in scope. Higher-order support is an
   acceptance decision below.

Inline declarations do not authorize execution or generator-specific inlining. Concrete
instances are ordinary helper rules for these measurements. Existing action metadata
does not affect recognition; mid-rule actions retain the analyzer's epsilon treatment.
Ordered choices and predicates keep their existing CFG applicability restrictions.

### Standard libraries and unresolved symbols

A library call can expand only when a selected, versioned definition profile provides
its body and arity. Profiles must distinguish Lrama and Menhir; the shared name `list`
does not prove shared structure. Record the profile identifier and a content digest.
Local definitions need no library profile. The analyzer must not select semantics from
an unversioned name list or silently fetch the latest library at analysis time.

The current `origin: "stdlib"` declaration lacks enough information to select such a
profile reliably for arbitrary external producers. The delivery and selection contract
is unresolved. Until a complete definition is available, return `notApplicable` for
dependent measurements, even for a recognized library name. A profile may cover a
documented subset, but any required uncovered call prevents complete expansion.

Resolve remaining symbols in the concrete domain explicitly. Declared external
terminals, including the builtin `error` token, can remain terminal identities. An
external rule or unknown external without a body, or an undeclared unresolved reference,
cannot supply exact FIRST/FOLLOW information and prevents the derived measurements.
Do not treat such a rule as an empty production or invent a token for it. Unused templates
do not require resolution merely because they exist in the source IR.

### Identity, recursion, and deterministic limits

Use a canonical instance key containing the definition identity and ordered, fully
substituted argument trees. Include library profile identity for library definitions.
Ignore locations, labels, and action-length metadata when comparing recognition trees;
retain terminal identities, expression kinds, and choice order. Share one instance for
each equal key. Insert its placeholder before expanding the body so direct or mutual
recursion back to the same instance becomes an ordinary graph edge.

Generated rule names must encode that key injectively. One candidate is the full UTF-8
key encoded as hexadecimal beneath a generated prefix. Start with `@gramin:parameter:`
and append colons until it is not a prefix of any input symbol name. This avoids collisions
between instances and collisions with user names without trusting a truncated hash.
`option[expr]` may serve as a display label, but delimiter concatenation alone is not a
unique identity. Byte-order sorting and fixed alternative/expression traversal order
must determine names, work order, output order, tie breaks, and failure selection.

Recursion alone is not a failure. For example, `p(X): X | p(X)` with `p(A)` has one
instance. A finite mutual cycle likewise terminates through memoization. In contrast,
`p(X): p(box(X))` can require endlessly different argument trees even when `box` has a
finite definition. Memoization cannot make that instance set finite.

Bound expansion with fixed, versioned counters. Proposed initial limits are 10,000
distinct instances, 1,000,000 expression-node visits across substitution and key
construction, and derived expression depth 256. Charge one visit before processing each
expression node in either operation, including intermediate arguments and completed
bodies; memo hits still charge for argument-key construction. Check each limit before
the operation that would exceed it, and test its boundary. These values are
proposals to validate against the pinned corpus, not current CLI options. No elapsed-time
limit, machine-speed-dependent fallback, or partial sample determines a measurement.

## Context and applicability

Preserve top-level features `capabilities` as the unchanged source IR capabilities, as
required by [RFC 0004](./0004-contextual-structural-features.md). Do not set its
`parameterizedRules` flag to false just to enable analysis.

Add proposed parseability-local metadata that identifies the affected FIRST/FOLLOW,
LL(1), and SLR fields and records:

- representation policy/version and whether expansion was required and completed;
- effective capabilities of the concrete grammar, with `parameterizedRules: false` only
  after all applications and templates have been eliminated from that representation;
- selected definition-profile identifiers/digests and the fixed limit policy;
- the concrete-rule sampling domain and the source-template `perRule` omission policy.

Reporters and future comparison code must use this local context for the affected E/B
values and the source context for unchanged fields. Different profiles or policies do
not establish numerical comparability merely because both inputs use parameters.

Expansion is all-or-none for dependent measurements. On failure, discard the partial
derived grammar and omit FIRST/FOLLOW distributions, LL(1) conflicts, SLR values, and
dependent per-rule values. Preserve source measurements. Record stable reasons under
each affected aggregate field in `parseability.notApplicable`; metadata explains the
per-rule omissions. Proposed reason categories are:

| Category | Condition |
|---|---|
| `parameter-definition-unavailable` | Required library or external rule body/profile is missing |
| `parameter-binding-unsupported` | Duplicate binders, incompatible available definitions, or higher-order application |
| `parameter-arity-mismatch` | Definition and application arities disagree, including a parameterized start |
| `parameter-symbol-unresolved` | A required concrete reference has no rule or terminal interpretation |
| `parameter-expansion-limit` | A named deterministic instance, node-work, or depth limit is reached |

Reasons must name the failing definition or reference and the violated limit where
relevant. These are proposed stable string prefixes within the existing string-valued
`notApplicable` maps, not already implemented diagnostic codes. Select failures in a
fixed order. Ordered choice and predicates retain their reasons; after successful
expansion, SLR still requires `--analysis lr` and plain BNF. EBNF expressions can therefore
allow FIRST/FOLLOW and LL(1) while leaving only SLR inapplicable. An empty concrete sample
continues to use the existing empty-sample rules.

## Contract changes and open decisions

The existing strict features schema has no place for this local context. Acceptance must
settle the exact metadata shape, optional source-rule parseability behavior, and reporter
and comparison handling together. A future features minor version and packaged schema
would describe the additive fields and the newly available measurements; this draft does
not reserve a version number. Preserve historical schema artifacts under the policy in
[RFC 0001](./0001-grammar-ir-v1.md) and the source-vector meaning in
[RFC 0006](./0006-rule-vectors-and-peg-shadowing.md).

Also settle how versioned library definitions reach analysis without source-format
branches in the analyzer. A frontend-provided definition payload or explicit analysis
profile would require a reviewed IR/protocol or API contract. The existing IR 1.3 fields
alone cannot identify an upstream library version. Do not claim expansion support for
external producers until this boundary is defined. Confirm whether higher-order
applications are required for the first supported profiles and whether the proposed
budgets accommodate the pinned corpus before accepting this RFC.

## Acceptance and regression checks

- Analyze the Ruby `parse.y` pinned by [the corpus fetcher](../../scripts/fetch-corpus.mjs),
  commit `33db313e855dfa83d7c66c2de6d63b9b401c32a0`, with the matching explicit Lrama
  definition profile. FIRST/FOLLOW distributions and LL(1) conflicts must be present;
  `--analysis lr` must also return finite raw SLR values. None may retain a generic
  unexpanded-parameters reason. Commit numeric fixtures after reviewing the profile.
- Compare a small parameterized grammar with a hand-written concrete counterpart under
  the same helper-rule structure. FIRST/FOLLOW cardinalities, LL(1) conflict counts,
  and requested SLR values must agree exactly. Include nullable and terminal arguments,
  nested calls, shadowed global names, and simultaneous substitution without capture.
- Direct and mutual recursion with the same instance keys must complete within limits;
  repeated equal calls create one instance. Growing-argument recursion must return a
  deterministic limit reason and no partial derived measurements. Test every budget
  exactly at its boundary and one unit beyond it.
- Test missing library profiles/bodies, unknown calls, unresolved external rules,
  external terminals, arity mismatches, unsupported formal applications, and collisions
  with generated-looking source names. No unavailable result becomes a misleading zero.
- Repeated runs with a stable source name must serialize byte-identically, including
  failure reasons, generated names in rankings, profile context, and limit outcomes.
  Test adversarial argument names whose naive bracket/comma labels would collide.
- The original IR must serialize identically before and after analysis. Compare all
  unchanged source sections, source unit metrics/diagnostics, and structural `perRule`
  fields against their pre-expansion fixtures. Keep source CFG structure fields
  inapplicable where they were inapplicable. Grammars without parameters must retain
  their existing numeric results.

## Alternatives

Replacing frontend IR with expanded rules would change source counts and graph shape,
breaking the measurement boundary. Delegating expansion to Lrama or Menhir would add
executable dependencies and generator-specific behavior to analysis. Treating library
names as predefined syntax without versioned bodies would produce unjustified values.
Expanding only calls reachable from start symbols would silently change the current
all-rule aggregate domain. Returning a prefix of an over-budget expansion would make
the values depend on traversal accidents. Keeping all parameterized grammars inapplicable
is honest but leaves finite, fully defined grammars unmeasurable.
