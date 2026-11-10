# Metric invariants

This checklist records relationships implied by the current implementation and
identifies existing example and fixed-seed checks. It does not add a generator,
test dependency, or new metric. The definitions in the [metrics catalog](./metrics-catalog.md)
and the [features schema](./features-schema.md) remain the public contract.

## Scope and notation

The target is features **1.0.0**, using the current
[`GrammarFeatures` schema](../packages/core/src/schemas/features.ts) and canonical
Grammar IR v1, currently **1.4.0**. Earlier feature schemas do not necessarily contain
these fields. Legacy IR v0 support and future-compatible v1 warnings are separate
compatibility checks, not permission to apply current equations to older feature files.

Unless a row says otherwise, assume `validateIR(ir).ok`, unique rule names, and an
unchanged input and analyzer options. Let:

- `R` be the set of rule names and `N = |R| = size.rules`;
- `A` be the list of top-level alternatives and `M = |A| = size.alternatives`;
- `P` be `features.perRule`, with `p(r)` the record for rule `r`;
- `G = (R, E)` be the directed dependency graph, with one edge per distinct rule pair;
- `Q` be the rules reachable from all start symbols together;
- `q(x)` mean the implementation's `round4(x)`.

These sets describe the source IR. Let `D` be the domain used for CFG parseability and
`K` its rule count. Without derived context, `D = R` and `K = N`. With
`parseability.context`, `K = context.concreteRules`: the concrete BNF domain contains
zero-arity source roots, required instances, and EBNF helpers; templates are absent.
Source vectors omit generated rows and templates' concrete values, so their CFG sample
is not `D`. Context counts describe that sample and are not comparison identity keys.

`validateIR` checks canonical form as well as schema shape. `analyzeGrammar` accepts a
typed object directly and does not itself validate the input IR. Its defensive handling
of repeated rule names merges `perRule` records and graph nodes, while size counts the
input definitions. Thus `P.length = size.rules` and the reachability partition below
require canonical input. The noncanonical regression test is not a generator template.

## Numeric comparison and absence

[`round4`](../packages/analyzer/src/numbers.ts) is
`Math.round((x + Number.EPSILON) * 10000) / 10000`. Compare emitted counts, set sizes,
percentiles, and sums of integer counts exactly. For a rounded ratio or average,
prefer equality with `q(the unrounded expression)`. An independently computed real
reference may use absolute error at most `0.00005` plus a small floating-point epsilon
for one rounding operation. Do not use that single-operation tolerance for a sum of
many separately rounded values, or multiply a rounded average back into an exact count.

Absence and zero are different outcomes. Check whether a field exists and inspect its
`notApplicable` reason before applying a numeric property. In particular, do not use
`value ?? 0` to compare CFG results, percentiles, or incomplete action counts. Required
legacy fields can remain as placeholders alongside `notApplicable`; an empty list in
such a section is not evidence that the measured set is empty.

## Size and per-rule aggregation

Sources: [`size.ts`](../packages/analyzer/src/size.ts),
[`expressions.ts`](../packages/analyzer/src/expressions.ts), and
[`analyze.ts`](../packages/analyzer/src/analyze.ts).
The properties in this table are **candidates** for generated tests. Existing example
coverage is identified separately below.

| ID | Property and conditions |
|---|---|
| S1 | `size.nonterminals = size.rules = P.length = N`; the names in `P` are exactly `R`, without duplicates. |
| S2 | `sum(P.alternatives) = M`. For valid nonempty rules, each local alternative count is at least one. |
| S3 | Let `L(a)` sum direct RHS item lengths: unwrap `group`; a `midRuleAction` or terminal whose literal is `""` contributes zero; every other item contributes one. Then `p(r).rhsItems = sum(L(a) for a in r)` and `sum(P.rhsItems) = sum(L(a) for a in A)`. Nested `seq`, sugar, and choice nodes are not flattened into this count. |
| S4 | For every rule, `0 <= maxRhsItems <= rhsItems`, and `maxRhsItems = max(L(a) for a in r)`. The global `size.maxRhsLength.value = max(P.maxRhsItems)`, using zero for the empty grammar. `size.maxAltPerRule.value = max(P.alternatives)`, also defaulting to zero. |
| S5 | `avgAltPerRule = q(M / N)` when `N > 0`, otherwise zero. `avgRhsLength = q(sum(P.rhsItems) / M)` when `M > 0`, otherwise zero. |
| S6 | `size.emptyAlternatives = count(a in A where L(a) = 0)`, between zero and `M`. It is not the nullable-rule count, nor the count of alternatives that can derive epsilon indirectly. |
| S7 | `size.unresolvedSymbols.count = size.unresolvedSymbols.names.length`; names are unique and byte-sorted. The set excludes rules, named terminal declarations, external symbols, and the enclosing rule's parameters. |
| S8 | Global expression nesting depth is `max(P.maxExpressionNestingDepth)`, defaulting to zero. An expression directly in an alternative has depth one; even zero-length actions and empty literal terminals are expression nodes. Depth is not RHS length. |

For nonempty samples, the maximum record selects the largest value and then the
byte-smallest rule name; a retained source line belongs to that selected rule. An empty
size maximum is `{ value: 0, rule: "" }`, and `notable.largestRule` is absent. Otherwise,
`notable.largestRule.name = size.maxAltPerRule.rule`.

## Graph, reachability, and recursion

Sources: [`graph.ts`](../packages/analyzer/src/graph.ts) and
[`structure.ts`](../packages/analyzer/src/structure.ts). These are **candidate**
properties, including properties of the internal graph helpers.

| ID | Property and conditions |
|---|---|
| G1 | `structure.reachableRules = \|Q\|`; `unreachableSymbols` is the set difference of `R` and `Q`; therefore `reachableRules + unreachableSymbols.length = N`. The two sets are disjoint and cover `R`. With no starts, `Q` is empty. |
| G2 | `p(r).references` is exactly the outgoing neighbor set, and `referencedBy` the incoming set. `fanOut = references.length`, `fanIn = referencedBy.length`; `t in p(r).references` iff `r in p(t).referencedBy`. All neighbors are rules. |
| G3 | `sum(P.fanOut) = sum(P.fanIn) = \|E\|`, with every local degree between zero and `N`. Self-edges count once in each direction. References at every expression depth, including parameter arguments, contribute edges; terminals and external-only symbols do not. |
| G4 | The `stronglyConnectedComponents(G)` result partitions `R`: each rule occurs once, components are nonempty, and their sizes sum to `N`. Members of a component are mutually reachable; the condensed graph is acyclic. |
| G5 | `recursionSccCount` counts all SCCs of size at least two, including unreachable ones. `largestSccSize.value = largestSccSize.members.length` and is the maximum such size, or zero. Singleton self-loops are excluded from both legacy metrics. |
| G6 | `recursiveRules.count` sums sizes of reachable SCCs that have size at least two **or** a singleton self-edge. `largestRecursiveComponent.value = members.length` is the largest of those sizes. Thus `0 <= largestRecursiveComponent.value <= recursiveRules.count <= \|Q\|`. These reachable metrics need not equal the legacy metrics. |
| G7 | If `\|Q\| > 0`, the two recursion ratios are `q(count / \|Q\|)` and `q(value / \|Q\|)`. Otherwise both ratios are absent and have `notApplicable` reasons. Direct left/right recursion counts are each between zero and `N`; they count rules, can overlap, and include unreachable rules. |
| G8 | Each start-reachability entry contains its exact reachable-rule set and `reachableRules = rules.length`. Entries correspond to distinct start symbols; their union is `Q`. `p(r).reachableFromStarts` contains exactly the starts whose entry includes `r`. With starts, `overlapRatio = q(intersection size / union size)`; with no starts the ratio is absent with a reason. |
| G9 | `maxDependencyDepth` is the longest path in the reachable SCC condensation, in edges. It is zero with no reachable components; otherwise it lies between zero and the number of reachable components minus one. |
| G10 | `topFanIn` and `topFanOut` equal the first `min(N, 10)` entries of all local degrees sorted by descending count, then byte order. Summing a top-ten list gives the edge total only when it contains every rule. |
| G11 | `sccSizeHistogram` contains ascending positive `{size, count}` bins for all source components. `sum(size * count) = N`; singleton components, self-loops, and unreachable rules remain in this partition. An empty grammar gives `[]`. |

A repeated occurrence such as `a: b b` gives two symbol occurrences and one dependency
edge. Do not equate `operations.symbolReferences`, `rhsItems`, unit-rule occurrences,
or single-reference-rule counts with graph degrees. Likewise, per-start reachable counts
overlap: their sum is not generally the global reachable count.

Candidate graph-shape checks are `0 <= fanInGini <= 1` and
`0 <= fanInEntropy <= log2(N)` for `N > 0`, allowing the rounding tolerance above for
the entropy upper bound. Both are zero when there are no edges. Articulation points and
bridges refer to the undirected graph with self-loops removed; verify them by removing
one vertex or edge and counting components. Directed betweenness uses a separate
definition; it is not a probability or a degree.

## Distributions, CFG analysis, and SLR

Sources: [`numbers.ts`](../packages/analyzer/src/numbers.ts),
[`parseability.ts`](../packages/analyzer/src/parseability.ts), and
[`structure.ts`](../packages/analyzer/src/structure.ts). The following are **candidate**
properties unless the precise example check is listed in the coverage section.

For every emitted percentile sample, `min <= p50 <= p95 <= max`. Nearest rank selects
the sorted one-based item at `ceil(p * sample.length)`, without interpolation. A
distribution's rounded average lies between its minimum and maximum; its percentile
values are observations from the sample. No ordering between average and p50/p95 is
required. `altPerRulePercentiles` samples `P.alternatives`; `rhsLengthPercentiles`
samples **all alternative lengths**, not `P.maxRhsItems` or per-rule averages. Empty
samples omit the corresponding object and record a reason.

Source CFG nullability, productivity, shortest derivation, nullable repetitions, and
indirect left recursion require all of `orderedChoice`, `predicates`, and
`parameterizedRules` to be false. This is a capability gate, not a check of the
source-format name. FIRST, FOLLOW, and LL(1) can instead use a successfully expanded
concrete domain recorded by `parseability.context`. EBNF sugar alone does not disable
FIRST/FOLLOW or shortest derivation.

| ID | Property and conditions |
|---|---|
| C1 | Under the CFG gate, `0 <= nullableRules <= N`. Nullable rules form the least fixed point of alternative nullability. An empty literal consumes zero and is nullable; a named terminal without an empty literal is not. |
| C2 | Under the CFG gate, finite `shortestDerivation` records and `shortestDerivationUnknown` partition `R`. Finite lengths are nonnegative integers, agree with the corresponding optional `perRule.shortestDerivation`, and length zero occurs exactly for nullable rules. An unknown result is absent locally, not zero. |
| C3 | With no derived context and an open CFG gate, each source rule has FIRST/FOLLOW cardinalities and local LL(1) counts. Global FIRST/FOLLOW distributions use these local cardinalities: average is `q(sum / N)`, maximum uses value/name tie-breaking, and percentiles use nearest rank. For `N = 0`, distributions are absent with reasons. With context, use all `K` concrete rules instead; published source rows are a partial sample. |
| C4 | Local and global `ll1Conflicts.total = firstFirst + firstFollow`. With no derived context, each global component equals the sum of its source local components. With context, the equality requires all concrete rows, not the published source rows. For a concrete rule with `k` alternatives, each component is at most `k * (k - 1) / 2`; total can reach twice that bound because one pair can satisfy both conflict tests. Counts are conflicting alternative pairs, not overlapping token counts. |
| C5 | FIRST/FOLLOW set sizes are bounded by the analyzer's tagged token-identity universe, not just `size.terminals`. Identities include literal/name terminals, character classes, any-char, external or unresolved symbols, and FOLLOW's end-of-input marker. Every start rule has FOLLOW size at least one. |
| C6 | `parseability.unitRules = sum(P.unitRules) <= M` in every capability context. These count alternatives, not unique unit edges. `cyclicUnitRules` contains disjoint cyclic SCCs of the unit-edge graph, including self-loops. Every listed member is a rule on a cycle in the full dependency graph; other alternatives in that rule need not be unit alternatives. |
| C7 | When applicable, `0 <= indirectLeftRecursiveRules <= N`. It counts the union of source left-corner SCCs of size at least two, including unreachable rules. Direct-only self-loops contribute zero; overlap with direct left recursion is permitted. Unknown referenced rule bodies omit the complete count, even behind consuming prefixes. |
| C8 | When applicable, `0 <= sugar.nullableRepetitions <= source star + source plus occurrences`. Each nullable operand contributes once per occurrence. No repetitions gives known zero, including plain BNF; source capability gates still precede this check. Unknown rule nullability omits the complete count when repetitions exist. |

When the source CFG gate is closed, `nullableRules`, nullable repetitions, indirect
left recursion, and source shortest derivations are unavailable. FIRST/FOLLOW, LL(1),
SLR, and corresponding optional local values can remain available only when parameter
expansion succeeds under CFG semantics; ordered choice and predicates still omit them.
Failed expansion omits all dependent aggregate and local results. The
structure section retains empty `unproductiveSymbols`, `shortestDerivation`, and
`shortestDerivationUnknown` arrays with `notApplicable` reasons for compatibility;
do not run the partition property C2 on them. Unit-rule counts remain available.

SLR additionally requires `{ lr: true }`, no rule `params` property, no symbol `args`,
and RHS expressions accepted by `productionItems`: symbols, terminals, character
classes, any-char, mid-rule actions, groups, and sequences. Choice, opt, star, plus,
and predicates require expansion or different semantics. A successful parameter path
already lowers EBNF into BNF; source EBNF outside that path can still omit SLR.
Missing opt-in or unsupported expressions omit `slr` with a reason. Candidate checks
for emitted SLR are integer nonnegative state/conflict counts; no starts gives all three
counts zero. With a valid
start there is at least one state. Conflicts count state/token cells before precedence
resolution, so neither conflict count is bounded by the number of productions alone.

For available SLR, let `v(d)` be each concrete rule's distinct contributing item/cell
count. `conflictInvolvement.total = sum(v(d))` and `involvedRules = count(v(d) > 0)`.
An item in a cell with both conflict kinds counts once; augmented start items do not
contribute. Without derived context, local source involvement sums to total. With
context, source rows omit templates and generated rules, so that equality is not required.
For nonempty `D`, `ruleRatio = q(involvedRules / K)` and percentiles sample every `v(d)`,
including unreachable zero-valued rules. For empty `D`, total and involved rules are zero,
but ratio and percentiles are absent with their exact child `notApplicable` keys.
Missing starts gives available zero samples; unavailable SLR omits the whole object.
There is no additional SLR state/work budget, and LR(0) state growth can be exponential.

`parseability.declaredConflicts` equals accepted source `IR.expectedConflicts`, independent
of LR opt-in or SLR applicability. Each present kind is a nonnegative safe integer;
explicit zero remains present, absent capture has a reason, and an empty object is
invalid. These source expectations have no equality or bound relationship with raw
SLR conflicts or involvement.

Do not equate productivity with finite shortest derivation for arbitrary external
symbols: declared external rules can be assumed productive while their consumed length
remains unknown. A stronger equality needs a closed grammar without such externals.

## Secondary counts and ratios

Source: [`secondary-metrics.ts`](../packages/analyzer/src/secondary-metrics.ts).
These are **candidate** properties with the stated applicability conditions.

| ID | Property and conditions |
|---|---|
| T1 | With `precedenceTable`, `levels = sum(assocBreakdown)`; `0 <= rulesWithPrecOverrides <= precOverrides <= M`; the alternative ratio is `q(precOverrides / M)` for `M > 0`, otherwise absent with a reason. `tokensInPrecedence.count <= size.terminals`; coverage counts matching declarations once even when both an alias and name occur in the table. Its ratio is `q(count / terminals)`, or zero for no terminals. |
| T2 | `lexicon.namedTokens + lexicon.literalTokens = size.terminals` as declaration counts. Scannerless grammars still emit these legacy fields but mark them inapplicable. `literalOccurrences`, `charClassCount`, and `anyCharCount` count visited expression occurrences and need not match declaration counts or RHS length. |
| T3 | `tokenUsage.used <= size.terminals`; coverage is `q(used / terminals)`, or zero with no terminals; `singleUse.length <= used`. Do not infer `used + redundancy.unusedTerminals.length = size.terminals` from valid IR alone: terminal declarations can repeat, aliases can collide, and the redundancy list drops an empty display name. A partition property needs unique nonempty declaration identities, unambiguous aliases, and expression aliases resolved to the same declaration. Do not sum distinct keyword/punctuation/collision lists into token counts. |
| T4 | With `ebnfSugar`, opt/star/plus count all corresponding nodes, including nested ones. With `parameterizedRules`, `sum(parameterizedCalls.known values) <= parameterizedCalls.total`, and parameterized rule definitions and inline rules are each at most `N`. Known-call counts cover only recognized standard-library external rules, not all calls. Closed capabilities omit the metrics and supply reasons. |
| T5 | With complete action metadata, `totalActions = trailingActions + midRuleActions`, `trailingActions <= M`, `rulesWithActions <= N`, and `rulesWithActions <= totalActions`. Coverage is `q(trailingActions / M)`, or zero for no alternatives. Average action length is `q(sum(all recorded action lengths) / totalActions)`, or zero with no actions, and lies between zero and the maximum. A trailing action counts when its metadata object exists; the implementation does not test its `present` value. |

When `IR010_LOSSY_ACTION` occurs, completeness is partial, complete action counts are
omitted, and retained legacy action values have `notApplicable` reasons. T5 must not
treat those retained values as complete measurements.

The following additional **candidates** come from
[`specialized-metrics.ts`](../packages/analyzer/src/specialized-metrics.ts):
`namedReferences <= symbolReferences`; recovery-rule counts are at most both `N` and
error-token occurrences; their ratios use the displayed numerators and denominators
with the implementation's zero-denominator fallback. Retained directive totals equal
the four directive counts' sum; action-reference totals equal positional plus named.
For retained comments, documented and undocumented rule sets partition `R` and comment
density is between zero and one. Missing source statistics omit their metrics with reasons.

Keep the two empty-alternative definitions separate:
`operations.explicitEmptyAlternatives.emptyAlternatives` counts RHSs containing only
mid-rule actions, including `[]`; `size.emptyAlternatives` also includes empty literals.
Thus the operational total is at most the size total, and its explicit count is at most
the operational total. Its ratio uses the operational total.

## Determinism and existing coverage

Candidate determinism checks use the same IR, source identity, options, producer, and
serialization options. Repeated analysis must produce byte-identical
`serializeCanonical` output. Object keys use UTF-8 byte order; arrays preserve their
contract-defined order. Rule records, neighbor lists, and set-like symbol lists are
byte-sorted; precedence levels retain source order. Ranking ties use byte order at the
ranking stage, which can precede rounding (for betweenness). Do not re-sort rounded
betweenness ties and assume the output changed incorrectly.

The following example and bounded fixed-seed checks are **already tested**. They do not
establish every candidate equation or every capability context above.

| Test file | Verified existing checks (test names) |
|---|---|
| [`analyze.test.ts`](../packages/analyzer/src/analyze.test.ts) | `matches hand-calculated calculator metrics`: concrete size, percentiles, recursion, precedence, and complete action values; `finds mutual recursion, dependency depth, and nullability`: one mutual SCC and rounded ratios. |
| [`analyze.test.ts`](../packages/analyzer/src/analyze.test.ts) | `computes CFG parseability and refactoring candidates`: concrete FIRST, conflict, unit-rule, and local counts; `counts the shared FOLLOW set conflict between two nullable alternatives`: FIRST/FOLLOW conflict count; `treats an empty literal as an empty derivation`: zero RHS, nullability, FIRST, shortest derivation, and SLR example. |
| [`analyze.test.ts`](../packages/analyzer/src/analyze.test.ts) | `computes advanced graph shape and shortest derivations`: concrete bridges, articulation point, start reachability, and local graph vector; `diagnoses cycles made only of unit rules`: one unit SCC; `handles a long dependency chain without recursive graph frames`: reachability and depth for 5,000 rules. |
| [`analyze.test.ts`](../packages/analyzer/src/analyze.test.ts) | `runs opt-in SLR analysis`; `measures expanded parameters while preserving source structural applicability`; `does not apply CFG analysis to predicate-bearing grammars`; `omits CFG nullability for ordered choice with a reason`; `does not apply CFG productivity diagnostics to ordered choice`: specific option and capability gates. |
| [`parameter-expansion.test.ts`](../packages/analyzer/src/parameter-expansion.test.ts) | `matches a hand-written nullable concrete grammar exactly`; `lowers opt, star, plus, nested choice, groups, and sequences to finite BNF`; `accepts exact instance and work budgets and rejects one less`; `accepts the exact cumulative UTF-8 identity/name byte budget and rejects one byte less`: concrete-domain oracles and deterministic limits. |
| [`parseability.test.ts`](../packages/analyzer/src/parseability.test.ts) | `attributes a shift/reduce cell to both contributing rules`; `counts an item once in a cell with both conflict kinds`; `samples unreachable zero-valued rules with nearest-rank percentiles`; `omits empty-domain ratios and percentiles with precise reasons`; `samples concrete parameter instances while preserving source rule rows`: involvement and sample-domain examples. |
| [`cfg-extensions.test.ts`](../packages/analyzer/src/cfg-extensions.test.ts) | `counts nested source occurrences and empty literals without expanding sugar`; `follows nullable rule prefixes and retains direct-plus-indirect overlap`; `does not mistake unresolved nullable prefixes for a known zero`: source scope, nullable-prefix, and absence boundaries. |
| [`declared-conflicts.test.ts`](../packages/analyzer/src/declared-conflicts.test.ts) | `copies explicit declarations independently of LR mode %s`; `preserves declarations when SLR is unavailable`; `explains absent declarations without supplying zero or losing other reasons`: source expectations are independent of measured SLR. |
| [`invariants.test.ts`](../packages/analyzer/src/invariants.test.ts) | `preserves canonical CFG invariants across fixed seeds`: bounded generated plain-CFG size, graph, reachability, and parseability checks. The generator does not establish properties for every capability context. |
| [`analyze.test.ts`](../packages/analyzer/src/analyze.test.ts) | `bounds precedence coverage to declared terminals`; `uses retained source statistics for operational and style metrics`; `marks empty-sample ratios and percentiles as not applicable`; `marks action measurements partial when a frontend reports omitted actions`: selected boundaries and absence checks. |
| [`analyze.test.ts`](../packages/analyzer/src/analyze.test.ts) | `uses byte-order tie breaking for rankings`; `serializes deterministically`; `unions dependencies when a noncanonical IR repeats a rule name`: selected ordering, repeatability, and defensive graph behavior. |
| [`numbers.test.ts`](../packages/analyzer/src/numbers.test.ts) | `uses deterministic nearest ranks for small and unsorted samples`; `omits empty samples and rejects invalid percentile bounds`: percentile examples and argument boundaries. There is no dedicated `round4` test in this file. |
| [`golden.test.ts`](../packages/analyzer/src/golden.test.ts) | `matches %s.features.json`: eight Yacc-family golden cases, both with and without retained locations. These lock complete example outputs, rather than proving relationships for arbitrary IR. |
| [`core.test.ts`](../packages/core/src/core.test.ts) | `rejects repeated rule names in the canonical form`; `rejects source metrics that cannot describe the grammar`; `is byte deterministic and can remove source locations`; `orders strings by UTF-8 bytes`: generator preconditions and serializer examples. |
| [`cross-format.test.ts`](../packages/cli/src/cross-format.test.ts) | `matches every applicable catalog class-A metric in the documented parser scope` checks the aligned JSON corpus after explicit scope normalization; `explains class-B applicability through the capabilities of %s` checks its capability caveats. This does not assert equality for arbitrary language-equivalent grammars. |

## Generator boundary

Start with bounded canonical IR: unique rule names, valid start references, at least one
alternative per rule, flattened top-level sequences/choices, permitted groups, and node-derived
capability flags. Use `validateIR` as a precondition and check `validateFeatures` on results.
Keep generated tree depth within the existing supported limit. Use unique resolved
terminal identities for properties that need a terminal partition, and valid source
statistics when testing source-derived ratios.

Cover small plain CFGs first: disconnected rules, self-loops, mutual cycles, duplicate
reference occurrences, epsilon, tied maxima, multiple/no starts, and no rules. Then add
separate valid contexts for EBNF, ordered choice, predicates, parameterization, and
partial actions. A capability change may require a tree change to remain valid. Test
field absence explicitly in each context; never fill absent metrics with zeros.

Keep the existing hand-calculated and golden fixtures as examples alongside future
properties. Begin with size sums, reachability partitions, and graph degree conservation;
they need no broad new testing framework. Any metamorphic comparison must name the
representation transformation and the metrics it preserves. Language equivalence alone
does not preserve rule counts, RHS shape, actions, or dependency structure.
