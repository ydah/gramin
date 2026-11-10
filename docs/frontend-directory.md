# Frontend directory

All frontends produce Grammar IR; measurements come from the same analyzer. A
supported format does not imply that every extension can be represented without
loss. Read diagnostics and capabilities alongside measurements.

| Implementation | CLI identifier or executable | Scope |
|---|---|---|
| [Yacc family](../packages/frontend-yacc/README.md) | `yacc-family` | Supported Yacc, Bison, and Lrama syntax |
| [BNF / EBNF](../packages/frontend-bnf/README.md) | `bnf` | Productions and supported EBNF notation |
| [ANTLR4](../packages/frontend-antlr/README.md) | `antlr4` | Supported parser and lexer grammars, including split input |
| [Menhir](../packages/frontend-menhir/README.md) | `menhir` | Supported Menhir productions and standard-library references |
| [Peggy](../packages/frontend-peg/README.md) | `peggy` | Ordered-choice and scannerless PEG input |
| [Python protocol reference](../examples/external-frontend-py/README.md) | `--frontend-cmd ./examples/external-frontend-py/gramin-bnf-frontend` | A small BNF/EBNF subset; dependency-free process example |
| [External frontend starter](../examples/frontend-template/README.md) | `--frontend-cmd ./bin/gramin-example-frontend` | Repository-ready Python adapter, tests, fixture, and CI; literal alternatives only |

The starter's source lives in this repository until its standalone template
repository is published. No third-party external frontend is listed as verified
without an implementation link and a stated supported grammar scope.

To list an external frontend, provide its repository, format/dialects, runtime
requirements, license, supported Grammar IR version, and a reproducible
`gramin frontend-test` invocation. State unsupported syntax, lossy conversions,
and whether any network or executable dependencies are required. Passing the
conformance check on supplied fixtures is contract evidence, not an endorsement
of the external executable's security or grammar semantics.

New formats should start as external frontends. Possible future implementations
include generated tree-sitter `src/grammar.json`, ABNF, Lark, pest, lalrpop, JavaCC,
and Happy. These are candidates, not currently supported inputs. Executing
tree-sitter `grammar.js` would cross gramin's source-execution boundary.
