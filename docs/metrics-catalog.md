# Metrics catalog v0.4

This file is the normative definition of metrics emitted in features v0.4.

- Classification: **E** is exact and mechanically determined; **H** is heuristic.
- Comparability: **A** compares across formats; **B** compares only with the stated
  capabilities and representation caveats; **C** is format-specific or heuristic and
  should not be compared numerically.

## Shared counting rules

1. RHS length is the sum of direct `Alternative.items`. A `midRuleAction` counts as zero.
   A `group` is transparent and contributes the count of its child. Every other expression,
   including sugar, choice, predicate, `charClass`, and `anyChar`, contributes one.
2. Dependency edges visit `symbol` references at every expression depth, including
   parameterized-call arguments. External symbols do not create graph nodes or edges.
3. Averages and ratios use round-half-up behavior to four decimal places.
4. Equal rankings use symbol-name byte order. Symbol lists use the same order unless source
   order is semantically meaningful, as in precedence levels.
5. Repeated references between two rules form one graph edge for fan-in/out and reachability.
6. Identical input must serialize to byte-identical features.
7. Percentiles use nearest rank: sort `n` observations and select the one-based item at
   `ceil(p * n)`. Empty samples omit their percentile object with a `notApplicable` reason.

## Capability context

`capabilities` is copied unchanged from Grammar IR. It is not a measurement: it identifies
the representation context needed to interpret class-B measurements. Consumers must not
infer the same context from `source.format`.

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
| `directRightRecursiveRules` | Rules whose last effective reference is themselves | E | B |
| `recursionSccCount` | Tarjan SCCs containing two or more rules | E | B |
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
`unproductiveSymbols` is computed by a least fixed point over productive terminals and
rules; unresolved symbols are not assumed to be productive. A non-empty list also produces
`ANALYZER006_UNPRODUCTIVE_RULES`.

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

All are **E/B** and are emitted only for the relevant capability.

- `opt`, `star`, `plus`: corresponding expression-node counts.
- `parameterizedRuleDefs`: rules with parameters.
- `parameterizedCalls.total`: symbol calls carrying arguments.
- `parameterizedCalls.known`: counts grouped for recognized standard-library calls.
- `inlineRules`: rules declared inline.

## Actions

Action metrics are **E/C** because action-writing style differs strongly by format.
`completeness` is `partial` when an `IR010_LOSSY_ACTION` diagnostic says source actions
were omitted, and `complete` otherwise:

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
- CFG nullability is omitted for `orderedChoice`.
- empty rule or alternative samples omit their percentile object;
- recursion ratios are omitted when no rule is reachable from a start symbol;
- complete action counts are omitted after diagnosed lossy action handling.
