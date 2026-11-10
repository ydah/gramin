---
title: Frontend directory
description: Bundled grammar frontends, external protocol examples, and conformance checks.
---

# Frontend directory

| Frontend | Identifier | Implementation |
|---|---|---|
| Yacc / Bison / Lrama | `yacc-family` | [Package](https://github.com/ydah/gramin/tree/main/packages/frontend-yacc) |
| BNF / EBNF | `bnf` | [Package](https://github.com/ydah/gramin/tree/main/packages/frontend-bnf) |
| ANTLR4 | `antlr4` | [Package](https://github.com/ydah/gramin/tree/main/packages/frontend-antlr) |
| Menhir | `menhir` | [Package](https://github.com/ydah/gramin/tree/main/packages/frontend-menhir) |
| Peggy / PEG.js | `peggy` | [Package](https://github.com/ydah/gramin/tree/main/packages/frontend-peg) |

The [support matrix](/formats/) describes their syntax boundaries. Capabilities and
diagnostics remain part of every measurement.

## External frontends

The [Python BNF/EBNF reference](https://github.com/ydah/gramin/tree/main/examples/external-frontend-py)
demonstrates the executable protocol without requiring another runtime dependency
beyond Python. The [template repository](https://github.com/ydah/gramin-frontend-template)
contains a small literal-alternative parser, tests, a sample grammar, and CI. Replace
its parser for your format; it is not a general BNF implementation.

Check a fixture group before using an external frontend:

```sh
gramin frontend-test grammar.ext --frontend-cmd ./bin/my-frontend
```

This validates schema, canonical form, and capability declarations, then compares
two canonical outputs for that input. It does not prove language equivalence or
sandbox an external program. Add fixtures for each supported dialect, invalid
input, and lossy conversion. See the [frontend protocol](/reference/frontend-protocol)
and [directory submission details](https://github.com/ydah/gramin/blob/main/docs/frontend-directory.md).

Future format candidates include generated tree-sitter `src/grammar.json`, ABNF,
Lark, and pest. They are not yet listed as supported implementations. Embedded
source actions remain opaque; executing tree-sitter `grammar.js` is outside that
boundary.
