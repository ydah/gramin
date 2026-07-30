# gramin

Command-line grammar analysis for POSIX Yacc, Bison, Lrama, BNF, EBNF, ANTLR4, Menhir,
Peggy, and PEG.js files.

## Usage

Run without installing:

```sh
npx @gramin/cli analyze grammar.y --format md
```

Or install the command globally:

```sh
npm install --global @gramin/cli
gramin analyze grammar.y --format json
```

Use `gramin --help` to list commands and options. See the
[project README](https://github.com/ydah/gramin#readme) for examples, supported syntax,
exit codes, and the external frontend protocol.

## License

MIT
