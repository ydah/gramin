# Metrics catalog v0.8

This file is the normative definition of metrics emitted in features v0.8.

- Classification: **E** is exact and mechanically determined; **H** is heuristic.
- Comparability: **A** compares across formats; **B** compares only with the stated
  capabilities and representation caveats; **C** is format-specific or heuristic and
  should not be compared numerically.

## Shared counting rules

1. RHS length is the sum of direct `Alternative.items`. A `midRuleAction` or a terminal
   with an empty literal counts as zero.
   A `group` is transparent and contributes the count of its child. Every other expression,
   including sugar, choice, predicate, `charClass`, and `anyChar`, contributes one.
2. Dependency edges visit `symbol` references at every expression depth, including
   parameterized-call arguments. External symbols do not create graph nodes or edges.
3. Averages and ratios use round-half-up behavior to four decimal places.
4. Equal rankings use symbol-name byte order. Symbol lists use the same order unless source
   order is semantically meaningful, as in precedence levels.
5. Repeated references between two rules form one graph edge for fan-in/out and reachability.
6. Identical input must serialize to byte-identical features when the source name is stable;
   use CLI `--source-name` to remove invocation-path dependence.
7. Percentiles use nearest rank: sort `n` observations and select the one-based item at
   `ceil(p * n)`. Empty samples omit their percentile object with a `notApplicable` reason.

## Capability context

`capabilities` is copied unchanged from Grammar IR. It is not a measurement: it identifies
the representation context needed to interpret class-B measurements. Consumers must not
infer the same context from `source.format`.

Successful parameter expansion adds `parseability.context` for FIRST/FOLLOW, LL(1), and
SLR only. Its concrete domain contains every zero-arity source rule, required parameter
instances, and deterministic EBNF helpers. Source structural, sugar, and unit-rule metrics
retain their original domain. Context fields are metadata, not metric declarations.
Compare derived values only under the same representation, effective capabilities, and
limit policy; sample counts and omitted template names are not comparison identity keys.
Missing external or standard-library bodies prevent complete expansion. See
[RFC 0007](./rfcs/0007-expand-parameterized-rules-for-parseability.md).

## Size

| Metric | Definition | Class | Compare |
|---|---|---:|---:|
| `terminals` | Declared and implicit terminals after alias resolution | E | A |
| `nonterminals`, `rules` | Rule definitions; both names expose the same count in v0.2 | E | A |
| `alternatives` | Top-level rule alternatives | E | A |
| `unresolvedSymbols` | Distinct references absent from terminals, rules, and externals | E | A |
| `avgAltPerRule` | Alternatives divided by rules | E | A |
| `maxAltPerRule` | Largest alternative count; name breaks ties | E | A |
| `avgRhsLength` | Mean RHS length under the shared rule | E | A |
| `maxRhsLength` | Largest RHS length; rule name breaks ties | E | A |
| `nestedChoiceCount` | Nested `choice` nodes below alternatives | E | B (`ebnfSugar`) |
| `emptyAlternatives` | Alternatives whose effective RHS length is zero | E | A |
| `altPerRulePercentiles` | Nearest-rank p50 and p95 of alternatives per rule | E | A |
| `rhsLengthPercentiles` | Nearest-rank p50 and p95 under the shared RHS rule | E | A |

EBNF syntax can compress alternatives and RHS items. Compare those counts together with
nested choice and sugar metrics.

## Structure

| Metric | Definition | Class | Compare |
|---|---|---:|---:|
| `directLeftRecursiveRules` | Rules whose first effective reference is themselves | E | B |
| `indirectLeftRecursiveRules` | Source rules in left-corner SCCs containing at least two distinct rules; nullable prefixes expose subsequent references | E | B (source CFG) |
| `directRightRecursiveRules` | Rules whose last effective reference is themselves | E | B |
| `recursionSccCount` | Tarjan SCCs containing two or more rules | E | B |
| `sccSizeHistogram` | Counts of all source dependency SCCs by positive rule count, including singleton and unreachable components | E | B (source graph) |
| `largestSccSize` | Largest recursive SCC, with sorted members | E | B |
| `maxDependencyDepth` | Longest edge path from a start symbol in the SCC-condensed reachable DAG | E | A |
| `topFanIn`, `topFanOut` | Top ten unique incoming/outgoing rule-edge counts | E | A |
| `unreachableSymbols` | Rules unreachable from every start symbol | E | A |
| `unproductiveSymbols` | Rules that cannot derive any terminal sequence | E | A |
| `nullableRules` | Count from least fixed-point CFG nullability | E | B (CFG) |
| `reachableRules` | Rules reachable from at least one start symbol | E | A |
| `recursiveRules` | Reachable rules in a multi-rule SCC or a self-loop SCC, with reachable ratio | E | B |
| `largestRecursiveComponent` | Largest reachable recursive component, members, and reachable ratio | E | B |

EBNF repetition replaces explicit recursion, so recursion counts are not directly comparable
to BNF/Yacc counts. In PEG grammars direct left recursion is a likely defect signal rather
than a complexity measure. CFG nullability is omitted for ordered choice.
`recursionSccCount` and `largestSccSize` retain their features 0.2 definition and describe
mutual recursion only; the new recursive-component fields also recognize self-loops.
`sccSizeHistogram` covers the complete source SCC partition, including acyclic singleton
components and unreachable rules. Bins are `{size, count}` in ascending size order;
`sum(size * count)` equals the distinct source-rule count. The empty population is `[]`.
This structural graph measurement applies even when CFG interpretation is unavailable;
it never mixes concrete parameter instances into the source population. See
[RFC 0013](./rfcs/0013-scc-size-histogram.md).
`unproductiveSymbols` is computed by a least fixed point over productive terminals and
rules; unresolved symbols are not assumed to be productive. A non-empty list also produces
`ANALYZER006_UNPRODUCTIVE_RULES`. Productivity and shortest derivation are omitted for
ordered-choice, predicate-bearing, and unexpanded parameterized grammars; their required
compatibility arrays remain empty and are listed in `notApplicable`.

Indirect left recursion visits every source rule, including unreachable rules. Groups,
unordered choices, and repetitions expose their child left corners; sequences continue
through nullable prefixes. Direct-only self-loops contribute zero, while rules with both
direct and indirect cycles can occur in both counts. Ordered choice, predicates, or
source parameterization omit this metric before checking for a zero. A referenced
external rule or unresolved symbol conservatively omits the complete count with an
`undefined rule` reason, even behind a consuming prefix. Declared and external terminals
consume input; defined rules take precedence over terminal declarations. Unused external
declarations do not affect applicability. See
[RFC 0011](./rfcs/0011-indirect-left-recursion.md).

## Precedence

All are **E/B** and apply only when `precedenceTable` is true.

- `levels`: precedence declarations in source order.
- `assocBreakdown`: declaration counts for left, right, nonassoc, and precedence-only.
- `precOverrides`: alternatives carrying an explicit precedence override.
- `maxTokensPerLevel`: largest source precedence-level token list.
- `rulesWithPrecOverrides`: rules containing at least one explicit override.
- `precOverrideAlternativeRatio`: overrides divided by all top-level alternatives.
- `tokensInPrecedence`: distinct listed terminals and their ratio to all terminals.

## Lexicon

| Metric | Definition | Class | Compare |
|---|---|---:|---:|
| `namedTokens` | Terminals with a symbolic name | E | B (non-scannerless) |
| `literalTokens` | Terminals represented only by a literal | E | B (non-scannerless) |
| `literalOccurrences` | Literal-bearing terminal expression occurrences | E | B (scannerless) |
| `charClassCount`, `anyCharCount` | Corresponding scannerless nodes | E | B (scannerless) |
| `keywordLike` | Distinct alphabetic literals and aliases | H | C |
| `punctuationLike` | Distinct non-alphanumeric literals and aliases | H | C |

For scannerless grammars, consumers use `literalOccurrences`, `charClassCount`, and
`anyCharCount`. Declaration counts remain present for features v0.2 compatibility but are
listed in `notApplicable` because they do not describe a separate lexer.

## Sugar and extensions

All are **E/B**. Occurrence and parameter-use fields require the relevant capability;
`nullableRepetitions` instead requires source CFG semantics.

- `opt`, `star`, `plus`: corresponding expression-node counts.
- `nullableRepetitions`: source `star` and `plus` occurrences whose operands are CFG-nullable,
  including nested and unreachable occurrences; no generated helper contributes.
- `parameterizedRuleDefs`: rules with parameters.
- `parameterizedCalls.total`: symbol calls carrying arguments.
- `parameterizedCalls.known`: counts grouped for recognized standard-library calls.
- `inlineRules`: rules declared inline.

Nullable repetitions require no analysis flag. An empty or plain BNF source grammar has
an exact zero. Ordered choice, predicates, and source parameterization omit the field
before the zero check. With repetitions present, any referenced external rule or unresolved
symbol conservatively omits the complete count with an `undefined rule` reason; with no
repetitions the known zero remains available. Unused external declarations do not matter,
and declared or external terminals consume input. Defined rules take precedence over
terminal declarations. See [RFC 0010](./rfcs/0010-nullable-repetitions.md).

## Actions

Action metrics are **E/C** because action-writing style differs strongly by format.

- `completeness`: `partial` when an `IR010_LOSSY_ACTION` diagnostic says source actions
  were omitted, and `complete` otherwise.

- `altActionCoverage`: alternatives with a trailing action divided by alternatives.
- `midRuleActions`: opaque actions inside RHS items.
- `avgActionLength`, `maxActionLength`: character lengths across trailing and mid-rule
  actions. Empty action sets produce zero.
- `trailingActions`: alternatives carrying a trailing action.
- `totalActions`: trailing plus mid-rule actions.
- `rulesWithActions`: rules containing either action form.

The three new counts are omitted when completeness is partial. Required features 0.2
action fields remain present for compatibility but are listed in `notApplicable` and must
not be presented as complete measurements. Action length totals and percentiles are not
defined in features 0.3.

## Parseability

FIRST and FOLLOW measurements are **E/B (CFG)** and are omitted for ordered choice,
semantic predicates, and parameterized rules whose concrete expansion cannot complete.
Terminal identities distinguish symbolic names, literals, character classes, any-char,
external symbols, and end-of-input.

- `firstSetSize`, `followSetSize`: average, maximum, p50, and p95 rule-set cardinality.
- `ll1Conflicts.firstFirst`: alternative pairs in one rule with intersecting FIRST sets.
- `ll1Conflicts.firstFollow`: pairs where one nullable alternative conflicts with the
  other alternative through the rule FOLLOW set.
- `unitRules`: alternatives whose effective RHS is one non-parameterized nonterminal
  reference (**E/A**).
- `cyclicUnitRules`: sorted SCCs made entirely from unit-rule edges (**E/B**). A non-empty
  result produces `ANALYZER007_CYCLIC_UNIT_RULES`.
- `slr`: canonical LR(0) state count and raw SLR shift/reduce and reduce/reduce
  conflict-cell counts before precedence resolution (**E/B (plain CFG)**). It is opt-in
  through `--analysis lr`. A successful parameter-expansion path also lowers EBNF; outside
  that path, unsupported non-BNF expressions still omit SLR.
- `slr.conflictInvolvement.total`: distinct contributing LR item and conflicting state/token
  cell pairs, attributed to production left-hand rules and summed over the concrete domain
  (**E/B**, same SLR context).
- `slr.conflictInvolvement.involvedRules`: concrete rules with positive involvement,
  including unreachable rules in the domain (**E/B**, same SLR context).
- `slr.conflictInvolvement.ruleRatio`: involved rules divided by all concrete rules,
  rounded to four decimal places; omitted for an empty domain (**E/B**, same SLR context).
- `slr.conflictInvolvement.percentiles`: nearest-rank p50 and p95 over every concrete rule's
  involvement, including zeros; omitted for an empty domain (**E/B**, same SLR context).
- `declaredConflicts`: accepted global `%expect` and `%expect-rr` source counts as optional
  `shiftReduce` and `reduceReduce` nonnegative safe integers (**E/C**); copied from IR
  `expectedConflicts` independently of SLR opt-in or applicability.

An involvement item is identified by production occurrence and dot position. Distinct
items behind one deduplicated shift all count. A completed item in two conflicting FOLLOW
cells counts twice; an item in a cell with both conflict kinds counts once. Augmented
start items and ACCEPT actions do not contribute. Conflict-free and no-start concrete
grammars have measured zeros. An empty concrete domain retains `total: 0` and
`involvedRules: 0`, with `grammar has no rules` reasons under both
`slr.conflictInvolvement.ruleRatio` and `slr.conflictInvolvement.percentiles`. Unavailable
SLR omits the whole object and local involvement, retaining the `slr` reason instead.
SLR has no additional state/work budget; finite LR(0) construction can be exponential.

Source `perRule` rows omit templates' concrete values and exclude generated rows. With
derived context, neither involvement totals nor FIRST/FOLLOW and LL(1) aggregates must
equal source-row sums. All-rule distributions include zero-valued helpers and instances.
Changing helper structure can change these measurements without changing the language.
See [RFC 0008](./rfcs/0008-rule-slr-conflict-involvement.md) and
[RFC 0009](./rfcs/0009-slr-involvement-distribution.md).

Declared conflict counts describe author expectations, not measured parser behavior.
Absent accepted declarations omit `declaredConflicts` with a reason; explicit zero stays
present. For each kind, a duplicate or invalid global declaration permanently omits that
kind, while a valid other kind can remain. Rule-local annotations never supply a global
count. Do not compare declarations with raw SLR cells, resolved generator conflicts, or
LALR/IELR/GLR behavior. See [RFC 0012](./rfcs/0012-declared-conflict-expectations.md).

## Redundancy and refactoring candidates

- `commonPrefixPairs`, `maxCommonPrefixLength`: alternative pairs in one rule sharing
  direct, structurally equal RHS items (**E/A**).
- `duplicateAlternatives`: repeated syntax and precedence after ignoring actions (**E/A**).
- `structuralCloneGroups`: expression subtrees of at least three nodes repeated in two or
  more alternatives (**E/B**).
- `singleReferenceRules`: rules referenced exactly once in all RHS expressions (**E/A**).
- `unusedTerminals`, `unusedPrecedenceTokens`, `undefinedPrecedenceOverrides`: sorted
  declaration consistency lists (**E/B**).
- `listRecursion`: recursively shaped rules with a non-recursive base alternative and a
  list-like rule name, grouped by left, right, or mixed recursion, plus the dominant-
  direction ratio (**H/C**).

## Advanced structure

- `articulationPoints`, `bridges`: vertices and edges in the undirected dependency graph
  whose removal disconnects a component (**E/A**).
- `topBetweenness`: top ten directed, unweighted Brandes betweenness values (**E/A**).
- `fanInGini`, `fanInEntropy`: Gini coefficient and base-2 Shannon entropy of unique
  incoming dependency counts (**E/A**).
- `shortestDerivation`, `shortestDerivationUnknown`: least fixed-point minimum
  consumed-terminal length per rule, and rules without a finite result (**E/B**).
- `startSymbolReachability`: sorted reachable-rule sets and counts for each start symbol,
  plus intersection divided by union across start symbols (**E/A**).
- `maxExpressionNestingDepth`: deepest IR expression node below an alternative (**E/B**).

## PEG and ordered choice

These fields are omitted unless `orderedChoice` is true.

- `predicates`, `maxPredicateNestingDepth`: syntactic predicate count and nesting (**E/B**).
- `shadowedAlternativePairs`: structurally provable ordered-choice prefix shadowing (**E/B**).
- `potentialShadowedAlternativePairs`: additional pairs whose leading literals overlap
  after rule-reference expansion. This is kept separate from the provable count and does
  not emit the shadowing diagnostic (**H/C**).
- `backtrackingHotspots`: top rules ranked by shared direct-prefix length weighted by the
  later alternative position (**H/C**).
- `charClassOverlapPairs`: intersecting leading character classes between alternatives in
  the same ordered choice (**E/B**). It is omitted when Unicode property escapes prevent
  exact interval expansion.

## Lexical usage

- `literalPrefixCollisions`: distinct proper literal-prefix pairs, including an empty
  literal as a prefix of a non-empty literal (**E/B**).
- `keywordIdentifierCollisions`: keyword-like literals when an identifier-like declaration
  or rule exists (**H/C**).
- `tokenUsage`: declaration coverage and terminals used exactly once (**E/A**).

## Error recovery, style, and per-rule records

- `operations.errorTokenUses`, `rulesWithErrorRecovery`, `recoveryRuleRatio`: explicit
  `error` token adoption (**E/B**).
- `operations.namedReferences`, `symbolReferences`, `namedReferenceRatio`: labeled symbol
  reference adoption (**E/C**).
- `operations.declarationDirectives`: `%destructor`, `%printer`, `%union`, and `%code`
  declaration counts and total (**E/C**, when retained by the frontend).
- `operations.explicitEmptyAlternatives`: explicit `%empty` count, empty-alternative count,
  and their ratio (**E/C**, when retained by the frontend).
- `operations.actionReferences`: positional and named `$` references scanned outside
  strings and comments without retaining or parsing action bodies (**H/C**).
- `style`: uppercase terminal ratio, dominant snake/camel nonterminal convention, and
  deviations (**H/C**). When source statistics are retained it also reports comment
  characters divided by source characters, comment count, rules without an adjacent
  leading comment, and documented-rule ratio (**H/C**).
- `perRule`: name, alternative and total/maximum RHS counts, expression depth, fan-in/out,
  incoming/outgoing dependencies, start-symbol reachability, unit rules, optional CFG
  FIRST/FOLLOW sizes and LL(1) conflicts, and finite shortest derivation. Records use
  symbol byte order and are not collapsed into a score.
- `perRule.slrConflictInvolvement`: contributing item/cell count for a source zero-arity
  rule when SLR is available; omitted for templates under derived context (**E/B**).

Source-to-source `gramin diff` additionally emits normalized rule-tree edit distance and
the union of forward and reverse dependency reachability from changed rules. A features
baseline cannot provide these structural fields because it does not contain rule trees.
Normalization retains parsing metadata such as parameters, inline rules, ordered choices,
and precedence while excluding actions, named-reference labels, and locations.

## Notable locations

`largestRule`, `deepestRecursionMembers`, and `coreSymbols` expose exact names and available
source lines behind the size, SCC, and fan-in metrics. They are navigation aids, not
additional measurements.

## Inapplicable metrics

A section omits a metric that does not apply and records a stable explanation in its
`notApplicable` map. It must not emit `null` or a misleading zero. In particular:

- precedence metrics require `precedenceTable`;
- EBNF counts require `ebnfSugar`;
- parameterized counts require `parameterizedRules`;
- CFG nullability is omitted for `orderedChoice`, `predicates`, and `parameterizedRules`.
- CFG FIRST/FOLLOW and LL(1) conflicts are omitted for `orderedChoice` and
  grammars with `predicates` or `parameterizedRules`.
- productivity and shortest derivation are omitted for `orderedChoice` and
  grammars with `predicates` or `parameterizedRules`.
- SLR metrics require `--analysis lr`, plain BNF expressions, and expanded parameters.
- PEG metrics require `orderedChoice`.
- empty rule or alternative samples omit their percentile object;
- recursion ratios are omitted when no rule is reachable from a start symbol;
- complete action counts are omitted after diagnosed lossy action handling.
