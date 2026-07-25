# gramin

`gramin` converts parser grammar files into deterministic, versioned structural features
for tooling, review, and LLM-assisted analysis. It never executes semantic actions.

The current release supports POSIX Yacc, Bison, Lrama, BNF, and EBNF, including
parameterized rules, named references, EBNF sugar, and Lrama standard-library calls.

## Requirements

- Node.js 20 or newer
- pnpm 10

## Build and verify

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Quick start

```sh
node packages/cli/dist/bin.js analyze packages/frontend-yacc/fixtures/calc.y
node packages/cli/dist/bin.js analyze grammar.y --format md
node packages/cli/dist/bin.js analyze grammar.y --format llm --budget-chars 8000
```

Inspect or pipe the versioned Grammar IR:

```sh
node packages/cli/dist/bin.js ir grammar.y |
  node packages/cli/dist/bin.js analyze --ir -
```

Other useful commands:

```sh
node packages/cli/dist/bin.js detect grammar.y
node packages/cli/dist/bin.js validate-ir grammar-ir.json
```

Exit codes are 0 for success, 1 for partial analysis with error diagnostics, 2 for fatal
input or frontend failures, and 3 for invalid command usage.

## Corpus validation

Third-party grammars are downloaded at fixed commits and are not vendored:

```sh
scripts/fetch-corpus.sh
pnpm benchmark:corpus
```

On the pinned Ruby `parse.y`, the frontend and analyzer must finish within three seconds,
emit no error diagnostics, and report no unresolved symbols.

## Architecture

The package dependency direction is:

```text
core <- (frontend-* | analyzer | reporter) <- cli
```

`@gramin/core` publishes TypeScript contracts and JSON Schemas for Grammar IR and features.
See `docs/ir-schema.md`, `docs/features-schema.md`, and `docs/metrics-catalog.md` for the
normative definitions. Architectural decisions are recorded in `docs/decisions/`.
