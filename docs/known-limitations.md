# Known limitations

## Yacc-family semantic actions

The frontend treats C, C++, Ruby, and other action bodies as opaque balanced-brace blocks.
It understands ordinary quoted strings, character literals, line comments, and block
comments so braces inside them do not affect synchronization.

C++ raw strings are not fully tokenized. An action containing `R"..."` emits
`YACC003_SUSPICIOUS_RAW_STRING`; unusual delimiters or embedded quotes can still make brace
recovery approximate. An unterminated action emits `YACC001_UNCLOSED_ACTION`. The lexer
attempts to resume at a semicolon followed by a rule header and otherwise returns the
partial final action.

Semantic action source is never parsed, retained in IR, or executed. Only presence,
position, and character length are recorded.

## ANTLR4 target code and lexer commands

The ANTLR frontend parses grammar structure, not target-language code. Grammar actions and
lexer actions emit `IR010_LOSSY_ACTION`; semantic predicates emit
`IR011_LOSSY_SEMANTIC_PREDICATE`. Fragment lexer rules emit
`IR016_LOSSY_ANTLR_FRAGMENT` and are intentionally excluded from terminal counts. Lexer
modes are flattened with `IR014_LOSSY_LEXER_MODE`, and negated token sets are approximated
with `IR015_LOSSY_ANTLR_NEGATION`.

Lexer commands such as `skip`, `more`, `type`, and `channel` do not affect structural
features. Parser wildcard `.` is represented as the named terminal `ANY_TOKEN`, not the
scannerless `anyChar` node. Source action and predicate code is never retained or run.

## Menhir syntax

The in-process Menhir frontend targets classic colon-based rules, `%inline`,
parameterized symbols, precedence declarations, and the documented standard library.
OCaml preambles and comments are skipped; action bodies are opaque and contribute only
presence and length metadata.

The newer `let ... :=` syntax and attributes beyond `%public` are not expanded in the
initial frontend. Projects that require exact handling can provide an OCaml implementation
through the external frontend protocol, as described by ADR 0003. Unsupported constructs
must be reported rather than executed.

## Resource limits

Expression parsers enforce a configurable nesting limit of 500 by default. Inputs that exceed
the limit return a frontend nesting diagnostic and do not produce an IR. The analyzer, canonical
IR validation, and dependency graph traversal use explicit work stacks for expression trees and
large rule chains; semantic parser-generator conflicts remain outside gramin's scope.
