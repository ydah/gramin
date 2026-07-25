# gramin

`gramin` converts parser grammar files into deterministic, versioned structural features
for tooling, review, and LLM-assisted analysis. It never executes semantic actions.

The current release supports POSIX Yacc, Bison, Lrama, BNF, EBNF, ANTLR4, Menhir, and
Peggy/PEG.js, including split parser/lexer grammars, parameterized rules, named
references, EBNF sugar, scannerless expressions, and Lrama/Menhir standard-library calls.

## Requirements

- Node.js 20 or newer

## Quick start

```sh
npx gramin analyze grammar.y
npx gramin analyze grammar.y --format md
npx gramin analyze grammar.y --format llm --budget-chars 8000
```

Install the command globally when using it repeatedly:

```sh
npm install --global gramin
gramin analyze grammar.y --format md
```

Example Markdown output:

```text
# Grammar feature report

Features version: `0.2.0`

## Size

| Metric | Value |
|---|---:|
| `rules` | 2 |
| `alternatives` | 7 |
| `unresolvedSymbols.count` | 0 |
```

Inspect or pipe the versioned Grammar IR with the globally installed command:

```sh
gramin ir grammar.y | gramin analyze --ir -
```

Other useful commands:

```sh
gramin detect grammar.y
gramin validate-ir grammar-ir.json
```

Exit codes are 0 for success, 1 for partial analysis with error diagnostics, 2 for fatal
input or frontend failures, and 3 for invalid command usage.

## Development

Development requires pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Corpus validation

Third-party grammars are downloaded at fixed commits and are not vendored:

```sh
scripts/fetch-corpus.sh
pnpm benchmark:corpus
```

On the pinned Ruby `parse.y`, the frontend and analyzer must finish within three seconds,
emit no error diagnostics, and report no unresolved symbols. The same fetch also enables
error-free, unresolved-free integration tests for grammars-v4 JSON, SQLite, and Java,
including split parser/lexer grammars.

## Architecture

The package dependency direction is:

```text
core <- (frontend-* | analyzer | reporter) <- cli
```

`@gramin/core` publishes TypeScript contracts and JSON Schemas for Grammar IR and features.
See `docs/ir-schema.md`, `docs/features-schema.md`, and `docs/metrics-catalog.md` for the
normative definitions. Format comparison guidance is in `docs/cross-format-notes.md`.
Architectural decisions are recorded in `docs/decisions/`.
