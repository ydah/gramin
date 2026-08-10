# Diagnostics reference

Diagnostics are stable, machine-readable facts. The CLI prints `code: message` for source
diagnostics and `CODE path: message` for IR validation issues. By default warnings do not
change the exit status; `--fail-on warning` makes them a CI gate.

| Code family | Meaning | Typical severity |
|---|---|---|
| `SCHEMA_INVALID`, `IR_VERSION_UNSUPPORTED` | Input IR is not valid JSON Schema or uses an unsupported major version | error |
| `IR_CANON_*` | Input IR violates canonical Grammar IR form, including duplicate rule names | error |
| `ANALYZER001_UNRESOLVED_SYMBOLS` | A rule reference is not declared or external | warning |
| `ANALYZER002_UNREACHABLE_RULES` | A rule is not reachable from a start symbol | warning |
| `ANALYZER003_UNUSED_TERMINALS` | A declared terminal has no occurrence | warning |
| `ANALYZER004_FUTURE_IR_MINOR`, `ANALYZER005_LEGACY_IR_VERSION` | The IR minor version is future-compatible or legacy | warning |
| `ANALYZER006_UNPRODUCTIVE_RULES` | A rule cannot derive a terminal sequence | warning |
| `DETECT_AMBIGUOUS` | Automatic frontend detection has tied or near-tied candidates | warning |
| `BNF001`–`BNF004`, `BNF100`–`BNF102` | BNF/EBNF lexical or structural parse problem | error or warning |
| `BNF300_UNRESOLVED_SYMBOL` | BNF/EBNF reference is not declared | warning |
| `BNF400`–`BNF402` | BNF/EBNF input or file handling problem | error or warning |
| `PEG001`–`PEG003`, `PEG100_UNCLOSED_GROUP` | Peggy lexical or structural parse problem | error or warning |
| `PEG300_UNRESOLVED_SYMBOL` | Peggy reference is not declared | warning |
| `PEG400`–`PEG402` | Peggy input or file handling problem | error or warning |
| `ANTLR001`–`ANTLR002` | ANTLR lexical/action parse problem | error |
| `ANTLR400`–`ANTLR401` | ANTLR input or parser-rule problem | error |
| `MENHIR001`–`MENHIR003` | Menhir preamble, comment, or action problem | error |
| `MENHIR300_UNRESOLVED_SYMBOL` | Menhir reference is not declared | warning |
| `MENHIR400`–`MENHIR402` | Menhir input or file handling problem | error or warning |
| `YACC001`–`YACC003` | Yacc literal/action lexical problem | error or warning |
| `YACC004`, `YACC100`–`YACC102`, `YACC200`–`YACC209` | Yacc declaration or rule parse problem | error or warning |
| `YACC300_UNRESOLVED_SYMBOL` | Yacc reference is not declared | warning |
| `YACC400`–`YACC402` | Yacc input or file handling problem | error or warning |
| `IR010`–`IR016` | Frontend omitted or approximated source constructs | info |

Process-level failures use `INPUT_UNREADABLE`, `IO_ERROR`, `FRONTEND_TIMEOUT`,
`FRONTEND_OUTPUT_TOO_LARGE`, and `INTERNAL_LIMIT_EXCEEDED`; these return exit code 2.
