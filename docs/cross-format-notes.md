# Cross-format comparison notes

This comparison uses three authored fixtures for the same small JSON value language:

- Yacc: `packages/frontend-yacc/fixtures/json.y`
- ANTLR4: `packages/frontend-antlr/fixtures/Json.g4`
- Peggy: `packages/frontend-peg/fixtures/json.peggy`

The table is generated conceptually from committed, location-stripped features goldens.
All three inputs have zero unresolved symbols and pass the same Grammar IR canonical
validator.

## Observed features

| Metric | Class | Yacc | ANTLR4 | Peggy |
|---|---:|---:|---:|---:|
| rules | A | 7 | 5 | 10 |
| alternatives | A | 17 | 11 | 16 |
| avgRhsLength | A | 1.7059 | 1.6364 | 2.25 |
| maxDependencyDepth | A | 1 | 1 | 2 |
| unresolvedSymbols | A | 0 | 0 | 0 |
| unreachableSymbols | A | 0 | 0 | 2 |
| nestedChoiceCount | B | 0 | 0 | 1 |
| directLeftRecursiveRules | B | 2 | 0 | 0 |
| recursionSccCount | B | 1 | 1 | 1 |
| nullableRules | B | 0 | 0 | not applicable |
| namedTokens | B | 5 | 7 | 0 |
| literalOccurrences | B | 11 | 7 | 17 |
| charClassCount | B | 0 | 0 | 5 |
| opt / star / plus | B | n/a | 2 / 2 / 0 | 4 / 4 / 3 |
| altActionCoverage | C | 0 | 0 | 0 |

## Interpretation

Class A metrics share one counting definition and can be compared, but equality is not
expected. Yacc spells list structure as two explicit left-recursive helper rules. ANTLR
keeps repetition and optionality as EBNF nodes. Peggy is scannerless and includes two
unreachable demonstration rules (`keyword` and `other`) that exercise predicates without
changing the start rule's JSON language. Those source choices explain the different rule,
alternative, depth, and unreachable counts.

Class B metrics require the capability context. Yacc's left recursion and ANTLR/Peggy
repetition describe similar repetition strategies but are not numerically interchangeable.
Peggy ordered choice makes CFG nullability inapplicable. Its lexicon is represented by
literal occurrences, character classes, and `anyChar`, while Yacc and ANTLR have token
declarations.

Class C metrics describe format-specific style or heuristics. They should not be compared
numerically even when values happen to match.

The LLM digest emits a format interpretation line derived from the features source format.
Tests assert the ANTLR EBNF note and the PEG ordered-choice/scannerless notes. No analyzer
correctness discrepancy was found in this comparison; the observed differences are all
accounted for by fixture scope or documented capability/representation rules, so no defect
issue is open.
