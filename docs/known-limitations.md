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
