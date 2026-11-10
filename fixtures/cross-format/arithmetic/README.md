# Aligned arithmetic syntax corpus

These authored Yacc, BNF, ANTLR4, Menhir, and Peggy fixtures share four parser
rules: `arithmetic`, `expression`, `term`, and `factor`. They describe nonnegative
integer operands, the four binary operators, and parentheses. Multiplication and
division occur within `term`; addition and subtraction occur within `expression`.

The expression and term rules use explicit right recursion. Recursive alternatives
precede the base alternative so that Peggy can consume the longer form. This is a
syntax corpus, without evaluation actions or a claim of left-associative arithmetic
evaluation. For example, `1 + 2 * (3 - 4)` has the supported syntax; unary minus,
decimals, and exponents are outside this corpus.

## Lexical contract

| Token | Spelling |
|---|---|
| `NUMBER` | `0` or a digit `1` through `9` followed by zero or more digits `0` through `9` |
| `PLUS`, `MINUS` | `+`, `-` |
| `STAR`, `SLASH` | `*`, `/` |
| `LPAREN`, `RPAREN` | `(`, `)` |
| `EOF` | End of input, not a source character |

Space, tab, carriage return, and line feed separate tokens. Yacc and Menhir require
an external lexer implementing this contract; no lexer or grammar action is
executed by gramin. The Menhir unit actions remain opaque. BNF describes token
streams: its quoted `"NUMBER"` is a token category, not the characters `NUMBER`.
ANTLR supplies lexer rules and a skipped `WS` token. Peggy supplies scannerless
token rules, trailing whitespace, leading whitespace in `arithmetic`, and an
end-of-input predicate.

## Comparison scope

The [cross-format tests](../../../packages/cli/src/cross-format.test.ts) validate
and deterministically analyze each original IR first, including a check for zero
unresolved symbols. Whole-IR counts differ because Peggy retains lexical rules,
ANTLR retains its unused `WS` declaration, and the other formats represent named
tokens or quoted token labels.

For structural equality, the shared test selects the four parser rules and maps
the seven token categories to named terminals. It removes only whitespace and
`EOF` boundary references, preserving every parser alternative and Peggy's ordered
choice. It validates the resulting IR and recomputes scannerless, predicate, and
EBNF-sugar capability flags for this scope. This is the same explicit comparison
policy as the [aligned JSON corpus](../json/README.md).

The parser scope has seven terminals, four rules, nine alternatives, three unit
rules, six pairs sharing a common prefix, and two directly right-recursive rules.
All four rules are reachable. Each applicable class-A metric selected by the
shared test matches across the five formats. Productivity is excluded for Peggy
with an `orderedChoice` applicability reason, rather than treating the required
empty compatibility array as a measurement.

For CFG inputs, nullability, shortest derivations, FIRST/FOLLOW, LL(1), and raw SLR
are also checked against the same baseline. Peggy omits these CFG measurements
with an `orderedChoice` reason. Its lexical rules expose character classes and
repetition while separate-lexer token-declaration metrics are unavailable because
of `scannerless`. Absent EBNF, parameterized-rule, precedence-table, and PEG-only
capabilities retain their own applicability reasons. Class-C action and style
counts are not compared. Raw SLR omits precedence resolution.

Run from the repository root:

```sh
pnpm build
pnpm exec vitest run packages/cli/src/cross-format.test.ts
```

These checks compare authored grammar structures. They do not generate parsers or
prove equivalence of independently implemented lexers.
