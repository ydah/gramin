# Aligned JSON syntax corpus

These five authored fixtures describe JSON values with the same seven parser rules:
`json`, `value`, `object`, `members`, `member`, `array`, and `elements`.
Lists use explicit right recursion in every format, with the recursive alternative
before the base case so that PEG ordered choice can consume more than one element.
Empty objects and arrays are explicit alternatives. No EBNF sugar is used in these
seven rules.

The common lexical contract is:

| Token | JSON spelling |
|---|---|
| `STRING` | A double-quoted string; unescaped control characters are forbidden; escapes are `"`, `\`, `/`, `b`, `f`, `n`, `r`, `t`, or `u` followed by four hexadecimal digits |
| `NUMBER` | Optional minus; zero or a nonzero digit followed by digits; optional fraction with at least one digit; optional exponent with optional sign and at least one digit |
| `TRUE`, `FALSE`, `NULL` | `true`, `false`, `null` |
| `LBRACE`, `RBRACE` | `{`, `}` |
| `LBRACKET`, `RBRACKET` | `[`, `]` |
| `COLON`, `COMMA` | `:`, `,` |
| `EOF` | End of input, rather than a JSON character |

Space, tab, carriage return, and line feed are discarded between tokens.
Yacc and Menhir require a lexer obeying this contract; none is executed or supplied.
BNF represents the token stream, and its quoted terminal labels such as `"STRING"`
denote token categories, not the characters `STRING` in a JSON document. ANTLR
provides lexer rules. PEG provides scannerless token rules, trailing whitespace,
leading whitespace in `json`, and an end-of-input predicate. The Menhir unit actions
are opaque input to gramin; tests do not execute actions or generate parsers.

## Comparison scope

`packages/cli/src/cross-format.test.ts` first validates and analyzes each original
IR without rewriting it. It checks canonical serialization, deterministic features,
empty external-symbol lists, and zero unresolved symbols.

Whole-IR counts are deliberately **not** asserted equal. PEG retains lexical rules
in its rule graph, while ANTLR lowers lexer rules to terminal declarations and retains
its unused `WS` declaration. BNF has literal token labels; Yacc and Menhir have named
token declarations. These are different representations of lexical work.

For the equality check, the test explicitly selects the same seven parser rules,
maps token labels and PEG token-rule references to the eleven common named terminals,
and excludes whitespace and end-of-input boundary references. It rejects unexpected
parser expression shapes and missing token categories, validates the resulting IR,
and preserves PEG ordered choice. It does not expand, simplify, reorder, or replace
any parser alternative. Capability flags for scannerless nodes, predicates, and sugar
are recomputed for this parser scope; lexer-rule context remains unchanged.

The test enumerates every class-A metric in metrics catalog v0.7:

- Size: terminals, nonterminals, rules, alternatives, unresolved symbols,
  average and maximum alternatives per rule, average and maximum RHS length,
  empty alternatives, and both percentile pairs.
- Structure: maximum dependency depth, fan-in/out rankings, unreachable and
  reachable rules, articulation points, bridges, betweenness rankings, fan-in
  Gini and entropy, and start-symbol reachability.
- Parseability: unit rules.
- Redundancy: common-prefix pairs and maximum length, duplicate alternatives,
  and single-reference rules.
- Lexical usage: token usage.
- Productivity: unproductive symbols match for applicable CFG inputs. PEG marks
  this class-A field inapplicable because exact productivity requires PEG semantics;
  its required empty compatibility array is not treated as a measured zero.

The shared parser scope has eleven terminals, seven rules, seventeen alternatives,
five unit rules, two directly right-recursive rules, and no unreachable rules.
Class-B CFG nullability, FIRST/FOLLOW, LL(1), shortest derivation, and opt-in raw SLR
are checked for CFG inputs; PEG omits them with an `orderedChoice` reason. PEG-only
measurements are inapplicable for CFG inputs. The original scannerless lexicon uses
character-class/literal occurrence counts and marks separate-lexer declaration counts
inapplicable. EBNF, parameterized-rule, and precedence metrics retain their capability
reasons where absent. Class-C action/style/heuristic counts are not compared.

This corpus verifies aligned JSON **syntax structure**. It is not a generated-parser
conformance suite and does not establish byte-language equivalence of independently
implemented lexers. Existing frontend JSON fixtures remain useful examples of
different grammar structures and are not replaced by this corpus.
