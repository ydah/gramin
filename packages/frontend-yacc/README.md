# @gramin/frontend-yacc

POSIX Yacc, Bison, and Lrama grammar frontend for gramin.

## Installation

```sh
npm install @gramin/frontend-yacc
```

The package exports `yaccFrontend` together with the lower-level lexer, parser, AST, and
lowering APIs. Semantic actions are treated as opaque input and are never executed.

See the [known limitations](https://github.com/ydah/gramin/blob/main/docs/known-limitations.md)
for action-block recovery and unsupported source constructs.

## License

MIT
