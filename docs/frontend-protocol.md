# External frontend protocol

This document is the normative process contract for frontend executables. The
Grammar IR schema and canonical-form rules remain normative at
[`ir-schema.md`](./ir-schema.md).

## Invocation

The normal form passes read-only source file paths:

```text
<executable> parse [--dialect <name>] <file...>
```

The supplemental streaming form passes UTF-8 source bytes on standard input:

```text
<executable> parse [--dialect <name>] --stdin
```

`gramin --frontend-cmd` accepts a single executable path and invokes it directly,
without a command shell. Arguments cannot be embedded in that value. A wrapper
executable may be used when an interpreter or fixed arguments are required.

File arguments preserve the CLI order. The frontend may read them but must not write,
rename, create, or delete source files. It must not execute grammar actions or other
source text. Callers should grant only the filesystem and network access the frontend
actually requires; read-only source access and no network are the recommended
defaults.

For `--stdin`, the source name in `source.fileNames` should be `"<stdin>"`. A frontend
must not combine `--stdin` and file arguments.

## Output

On exit 0 or 1, stdout contains exactly one UTF-8 JSON document conforming to the
current Grammar IR schema. Logging never goes to stdout. Human-readable process
failures may go to stderr; recoverable source problems belong in
`GrammarIR.diagnostics`.

The frontend owns `source.format`, `source.dialect`, `source.fileNames`, and
`source.frontend`. It must declare capabilities from the nodes it actually emits and
must follow all canonical-form rules, including flattened top-level alternatives and
sequences.

## Exit codes

| Code | Meaning | Required stdout |
|---|---|---|
| 0 | Complete parse; warnings are allowed | Valid Grammar IR |
| 1 | Partial parse with one or more error diagnostics | Valid Grammar IR |
| 2 | Fatal parse or process failure | Ignored/empty |
| 3 | Invalid frontend invocation | Ignored/empty |

Signals and other exit codes are treated as fatal.

## CLI validation flow

The CLI starts the executable with `shell: false`, captures stdout/stderr, and then:

1. accepts only exit 0 or 1;
2. parses stdout as one JSON value;
3. validates the JSON Schema;
4. applies canonical-form validation;
5. passes only the validated value to the Analyzer;
6. returns 2 for any process, JSON, schema, or canonical-form failure.

Exit 1 is preserved after a valid partial IR has been analyzed and reported.

For reproducible multi-file reports, use `gramin analyze ... --source-root <dir>`. A single
`--source-name` is accepted only for one input file. Automatic format detection refuses tied or
near-tied candidates; pass `--frontend` when the content is ambiguous.

The CLI terminates an external frontend after 30 seconds by default and limits stdout and
stderr to 64 MiB each. Use `--frontend-timeout <ms>` to select a shorter or longer timeout;
these limits prevent a hung or unexpectedly verbose frontend from blocking or exhausting the
analysis process. Exceeding either limit is a fatal `FRONTEND_TIMEOUT` or
`FRONTEND_OUTPUT_TOO_LARGE` failure.

## Conformance checks

Run the same fixture group twice through the process boundary:

```sh
gramin frontend-test fixtures/sample.bnf --frontend-cmd ./bin/my-frontend
gramin frontend-test parser.ext lexer.ext --frontend-cmd ./bin/my-frontend --dialect demo
cat fixtures/sample.bnf | gramin frontend-test - --frontend-cmd ./bin/my-frontend
```

The command applies the normal process, JSON, schema, canonical-form, and capability
validation to both runs. It compares their complete canonical IR, including source
metadata, locations, and diagnostics. The JSON report records the frontend identity,
supplied fixtures, capabilities, two-run count, and passed checks. `-o` writes this
report to a file. `--frontend-timeout` applies independently to each invocation.
Standard input is read once and replayed for both runs.

A changed canonical IR produces `repeatable: false`, a
`FRONTEND_NONDETERMINISTIC` diagnostic on stderr, and exit 1. Valid partial frontend
results retain exit 1. Invalid process output, schema, canonical form, or capability
declarations return exit 2 without a success report. Invalid command options return
exit 3. Analysis, baseline, alternate report formats, location stripping, and source
renaming options are rejected so they cannot hide differences in a frontend's IR.

These checks sample only the supplied fixture group. They do not establish language
equivalence, prove determinism for every input, or verify that an external executable
obeys the read-only/no-source-execution requirements. Run separate fixture groups for
each supported dialect and for unsupported or lossy syntax. Trust and isolate the
chosen executable as a program you explicitly run.

See the [frontend directory](frontend-directory.md) for reference implementations
and the repository-ready starter.

### Troubleshoot conformance failures

The [deliberately broken Node examples](../examples/frontend-test-troubleshooting/)
emit fixed IR for `sample.bnf`, whose complete grammar is `start ::= "x";`.
They isolate validation failures and do not implement a general BNF parser. They
need no runtime dependencies and do not modify the input. Run these commands from
the repository root after `pnpm install --frozen-lockfile` and `pnpm build`.

#### A capability does not match the emitted nodes

```sh
node packages/cli/dist/bin.js frontend-test \
  examples/frontend-test-troubleshooting/sample.bnf \
  --frontend-cmd ./examples/frontend-test-troubleshooting/misdeclared-capability.mjs
```

The CLI exits 2, writes no report to stdout, and prints this diagnostic to stderr:

```text
IR_CANON_PREDICATES_CAPABILITY /capabilities/predicates: predicates must exactly reflect predicate nodes
```

This frontend declares `predicates: true` but emits only a terminal. Derive the
capability from the emitted nodes; this fixture needs `predicates: false`.

#### Schema-valid IR is not in canonical form

```sh
node packages/cli/dist/bin.js frontend-test \
  examples/frontend-test-troubleshooting/sample.bnf \
  --frontend-cmd ./examples/frontend-test-troubleshooting/noncanonical-ir.mjs
```

The CLI exits 2, writes no report to stdout, and prints:

```text
IR_CANON_TOP_LEVEL_SEQ /rules/0/alternatives/0/items/0: Alternative.items is already an implicit sequence
```

The frontend wraps the terminal in a top-level `seq`. Put its children directly
in `Alternative.items`; canonical validation applies after JSON Schema validation.

#### The second invocation emits different IR

```sh
node packages/cli/dist/bin.js frontend-test \
  examples/frontend-test-troubleshooting/sample.bnf \
  --frontend-cmd ./examples/frontend-test-troubleshooting/nondeterministic.mjs
```

The CLI exits 1 and prints this diagnostic to stderr:

```text
FRONTEND_NONDETERMINISTIC: canonical IR differs between the two fixture runs
```

Its JSON report on stdout has `runs: 2`. The `checks` object contains `schema: true`,
`canonicalForm: true`, `capabilities: true`, and `repeatable: false`. Both documents
pass validation, but the example adds a random UUID to a warning on every invocation.
Remove run-specific IDs and timestamps from the IR, including its diagnostics and
source metadata, to make repeated output identical.

For a real adapter, start with the [Python frontend template](https://github.com/ydah/gramin-frontend-template).
Passing conformance covers only the supplied fixtures. It does not sandbox the
executable or prove that its IR represents the source language correctly. Run only
executables you trust, with the access restrictions described above.

## Implementation checklist

- [ ] Accept `parse`, optional `--dialect`, and one-or-more paths or `--stdin`.
- [ ] Read path inputs without modifying them; never evaluate embedded source code.
- [ ] Write only a single Grammar IR JSON document to stdout.
- [ ] Put recoverable parse failures in `diagnostics`; reserve stderr for process errors.
- [ ] Populate frontend identity, source names, capabilities, and `irVersion`.
- [ ] Flatten top-level alternatives into `Rule.alternatives`.
- [ ] Avoid top-level `choice`, `seq`, and `group` nodes and nested `seq` nodes.
- [ ] Return 0 for complete IR, 1 for partial valid IR, 2 for fatal parse failure, and 3
      for invalid invocation.
- [ ] Test the output with `gramin validate-ir`.
- [ ] Test both valid output and deliberate canonical-form rejection.

The Python example under `examples/external-frontend-py/` was written against this
checklist and is covered by the CLI integration tests.
