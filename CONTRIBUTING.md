# Contributing to gramin

gramin measures grammar structure without executing grammar actions or predicates. Changes
should preserve deterministic output, explicit metric definitions, and honest applicability.

Start with a [good first issue](https://github.com/ydah/gramin/labels/good%20first%20issue),
or use the [frontend template](https://github.com/ydah/gramin-frontend-template)
to build an external adapter. See [compatibility and versioning](docs/versioning.md)
before changing a public contract, and [SECURITY.md](SECURITY.md) for private reports.

## Set up the workspace

Use Node.js 22.12.0 or newer and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

Build before running integration tests: workspace package imports resolve to their compiled
`dist` entry points. Rebuild after changing a package used by another package's tests.

The dependency direction is `core ← frontends/analyzer/reporter ← cli`. Frontends translate
source files into Grammar IR. The analyzer and reporters consume the public core contract
and must not branch on source-format names. Use public package exports for package imports.

## Make a focused change

- Add a regression test that fails before fixing a behavior defect.
- Keep source actions and predicates opaque. Never execute target-language code.
- Validate frontend output with the canonical IR validator, including unsupported and lossy
  constructs. Preserve diagnostics and capability context.
- Return a reason in `notApplicable` when a metric cannot be measured. A measured zero must
  mean that the quantity is known to be zero.
- Preserve byte-stable canonical serialization and ordering for identical inputs and options.

Propose a new metric or a changed counting definition in an RFC before implementing it. Copy
the [RFC template](docs/rfcs/0000-template.md) to the next available numbered file. Explain the
definition, E/H classification, comparison class, and applicability. Read the
[metrics catalog](docs/metrics-catalog.md) and [metric invariants](docs/metric-invariants.md)
when choosing tests. Class A does not imply that differently structured grammars for the
same language have equal values.

## Verify a change

Run the checks used by CI:

```sh
pnpm format:check
pnpm check:readme
pnpm lint
pnpm check:cross-format
pnpm typecheck
pnpm test
```

Use `pnpm format` for formatting fixes. When analysis output intentionally changes, rebuild
and regenerate the goldens with `pnpm update-golden`, then inspect their diffs. Regenerate
the comparison notes with `node scripts/update-cross-format-notes.mjs --update` when their
input goldens change. Do not edit generated JSON or comparison tables to hide a regression.

For site changes, run `pnpm site:check`. For package or release changes, run
`pnpm release:check`. That check downloads no corpus itself; fetch the pinned third-party
grammars first:

```sh
node scripts/fetch-corpus.mjs
pnpm release:check
```

Downloaded corpora and release artifacts stay out of Git. The authored
[cross-format JSON corpus](fixtures/cross-format/json/README.md) is checked in and has no
network requirement.

## Describe the result

Explain the problem, the resulting behavior, and the commands you used to verify it. Link
the relevant issue or RFC. Call out changed metric definitions, schema versions, capability
context, and golden output so reviewers can assess compatibility.

When changing parseability, distinguish the source domain from a parameter-expanded
concrete domain. Keep source capabilities and structural metrics unchanged, record the
derived representation policy, and test both omitted values and measured zeros. Update
the [metric coverage mapping](docs/metrics-coverage.json) with real implementation symbols
and named tests, then run `pnpm check:metrics`.
