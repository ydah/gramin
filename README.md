# gramin

[![npm version](https://img.shields.io/npm/v/@gramin/cli.svg)](https://www.npmjs.com/package/@gramin/cli)
[![CI](https://github.com/ydah/gramin/actions/workflows/ci.yml/badge.svg)](https://github.com/ydah/gramin/actions/workflows/ci.yml)

`gramin` converts parser grammar files into deterministic, versioned structural features
for tooling, review, and LLM-assisted analysis. It never executes semantic actions.

The current release supports POSIX Yacc, Bison, Lrama, BNF, EBNF, ANTLR4, Menhir, and
Peggy/PEG.js, including split parser/lexer grammars, parameterized rules, named
references, EBNF sugar, scannerless expressions, and Lrama/Menhir standard-library calls.

## Requirements

- Node.js 20 or newer

## Quick start

```sh
npx @gramin/cli analyze grammar.y
npx @gramin/cli analyze grammar.y --format md
npx @gramin/cli analyze grammar.y --format llm --budget-chars 8000
```

Install the command globally when using it repeatedly:

```sh
npm install --global @gramin/cli
gramin analyze grammar.y --format md
```

Example Markdown output:

```text
# Grammar feature report

Features version: `0.4.0`

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
gramin diff base.y changed.y --format md
gramin analyze changed.y --baseline base.features.json --fail-on-regression
gramin analyze grammar.y --format sarif
```

Exit codes are 0 for success, 1 for diagnostics at the selected `--fail-on` threshold, 2
for fatal input or frontend failures, and 3 for invalid command usage. Ambiguous automatic
frontend detection is fatal; pass `--frontend` to select explicitly. The default threshold is
`error`; use `--fail-on warning` to gate on warnings or `--fail-on none` to ignore diagnostics
for exit-status purposes. `--fail-on-regression` makes tracked complexity increases against a
baseline return exit code 1.

Use `--source-root <dir>` for byte-stable multi-file output, or `--source-name <name>` for a
single input. Parser nesting is limited to 500 levels by default and can be lowered with
`--max-nesting-depth`.

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
node scripts/fetch-corpus.mjs
pnpm benchmark:corpus
```

The benchmark checks Ruby `parse.y` and the pinned grammars-v4 JSON, SQLite, and Java
parser/lexer pairs against `fixtures/perf-baseline.json`. All cases must finish within their
limits, emit no error diagnostics, and report no unresolved symbols. Pinned Perl `perly.y` and
PHP `zend_language_parser.y` corpora additionally lock distribution, reachable-recursion,
precedence-shape, and action-count profiles.

## Architecture

The package dependency direction is:

```text
core <- (frontend-* | analyzer | reporter) <- cli
```

`@gramin/core` publishes TypeScript contracts and JSON Schemas for Grammar IR and features.
See `docs/ir-schema.md`, `docs/features-schema.md`, and `docs/metrics-catalog.md` for the
normative definitions. Format comparison guidance is in `docs/cross-format-notes.md`.
Architectural decisions are recorded in `docs/decisions/`.
