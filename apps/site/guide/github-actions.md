---
title: GitHub Actions and SARIF
description: Add grammar analysis and regression review to GitHub Actions.
---

# GitHub Actions and SARIF

The repository ships a composite action that can produce SARIF for GitHub Code Scanning:

```yaml
- uses: ydah/gramin@v1
  id: gramin
  with:
    files: grammar.y
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: ${{ steps.gramin.outputs.report }}
```

The action supports the same diagnostic threshold and regression concepts as the CLI. Use `fail-on` to decide which diagnostic severity fails the job, and use `baseline` with `fail-on-regression` when a repository wants to gate tracked structural changes.

## Keep policy explicit

Do not use a single “complexity score” as a release gate. Track a small set of metrics and issue lists that match the repository’s review goals. Store the baseline with the same frontend selection and source identity policy as the current run.

## Local reproduction

When a check fails, reproduce it with the CLI and inspect the Markdown report:

```sh
gramin analyze grammar.y --format md --fail-on warning
gramin analyze grammar.y --baseline base.features.json --fail-on-regression
```

See the project’s [diagnostics catalog](/reference/diagnostics) for stable diagnostic codes and [CLI options](https://github.com/ydah/gramin/blob/main/packages/cli/README.md) for the complete action input map.
