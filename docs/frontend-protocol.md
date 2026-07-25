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
