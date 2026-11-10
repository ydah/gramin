<h1 align="center">gramin</h1>

<p align="center">
  Deterministic structural analysis and feature diffs for parser grammars.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@gramin/cli"><img src="https://img.shields.io/npm/v/@gramin/cli.svg?style=flat-square" alt="npm version"></a>
  <a href="https://github.com/ydah/gramin/actions/workflows/ci.yml"><img src="https://github.com/ydah/gramin/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://ydah.github.io/gramin/guide/getting-started">Documentation</a> ·
  <a href="https://ydah.github.io/gramin/sandbox">Try the sandbox</a> ·
  <a href="https://ydah.github.io/gramin/atlas/">Grammar Atlas</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

gramin turns grammar files into counts, distributions, and rule-level vectors.
Inspect a grammar, compare revisions, or bring the same measurements into pull
requests, scripts, and agent workflows. Bundled frontends never execute grammar
actions or predicates.

## Quick start

Requires Node.js 22.12.0 or newer. Save this as `grammar.y`:

```yacc
%token NUMBER
%%
expression : term | expression '+' term ;
term       : NUMBER | '(' expression ')' ;
```

Run without installing:

```sh
npx --yes @gramin/cli analyze grammar.y --format md
```

This sample has 2 rules, 4 alternatives, and 4 terminals. The report also includes
recursion, reachability, diagnostics, and per-rule measurements.

For repeated use, install the CLI:

```sh
npm install --global @gramin/cli
```

Prefer a browser? The [sandbox](https://ydah.github.io/gramin/sandbox) includes
runnable samples and before/after comparisons. Grammar contents stay in your browser.

## Supported grammars

| Grammar | Frontend ID |
| --- | --- |
| Yacc, Bison, Lrama | `yacc-family` |
| BNF, EBNF | `bnf` |
| ANTLR4 | `antlr4` |
| Menhir | `menhir` |
| Peggy, PEG.js | `peggy` |

Detection is automatic. Use `--frontend <id>` when it is ambiguous, or
`gramin detect grammar.y` to inspect candidates. See the
[support matrix](https://ydah.github.io/gramin/formats/) for supported syntax.

## Compare and review

Compare two revisions of a grammar:

```sh
gramin diff before.y after.y --format md
```

Differences include aggregate metrics and named rule vectors. Comparisons check
capabilities and measurement context; unavailable measurements retain their reasons.
Use `--baseline` and `--fail-on-regression` to gate changes against a saved feature
report. See [comparison semantics](docs/diff.md).

### Review pull requests automatically

Add `.github/workflows/grammar.yml`:

```yaml
name: Grammar review
on: [pull_request]

permissions:
  contents: read
  pull-requests: write

jobs:
  grammar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: ydah/gramin@v1
        with:
          files: grammar.y
          frontend: yacc-family
```

The Action measures the merge-base, updates one PR comment, and writes a job
summary. See the [Action guide](docs/github-action.md) for SARIF output, regression
policies, fork permissions, and pinning to a reviewed release or commit.

## Use the data

Export a feature document or measure several independent grammars:

```sh
gramin analyze grammar.y --format json
gramin analyze-many first.y second.y --format csv -o grammars.csv
```

Outputs include JSON, CSV, Markdown, SARIF, and bounded LLM digests. The
[data output guide](docs/data-output.md) covers CSV structure, unavailable values,
and a Python standard-library import example.

For agent clients, the [MCP server](docs/mcp.md) provides `analyze`, `diff`, `ir`,
and `digest` over stdio. To support another grammar format, start with the
[frontend template](https://github.com/ydah/gramin-frontend-template) and validate
it with `gramin frontend-test`. See the [external frontend protocol](docs/frontend-protocol.md).

Use `gramin --help` for the complete command and option reference. Exit status
`0` means success, `1` means a diagnostic threshold or regression gate was hit,
`2` means a fatal input or frontend failure, and `3` means invalid command usage.

## Measurement boundaries

Features have explicit definitions and applicability conditions. gramin measures
structure; it does not generate parsers or prove language correctness.

Raw SLR analysis is opt-in with `--analysis lr`. It omits precedence resolution
and cannot be compared with a parser generator's `%expect` values.

Parser nesting defaults to 256 levels and supports a maximum of 256.
Use `--max-nesting-depth` to set a lower limit. Read the
[known limitations](docs/known-limitations.md) before interpreting a result.

## Explore further

- [Grammar Atlas](https://ydah.github.io/gramin/atlas/) and the [Ruby parse.y chronicle](https://ydah.github.io/gramin/atlas/ruby-history) — downloadable JSON/CSV from pinned grammar sources.
- [Metrics catalog](docs/metrics-catalog.md), [invariants](docs/metric-invariants.md), and [comparability](https://ydah.github.io/gramin/concepts/comparability/) — what each measurement means.
- [Grammar IR](docs/ir-schema.md), [feature schema](docs/features-schema.md), and [design decisions](docs/decisions/) — the contracts behind the pipeline.
- [Compatibility policy](docs/versioning.md) and [security policy](SECURITY.md) — versioning, trust boundaries, and reporting issues.

## Development

The repository is a pnpm workspace. Use the pnpm version pinned in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete checks, corpus benchmarks,
and metric proposal process.

## License

[MIT](LICENSE).
