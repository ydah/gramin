# GitHub Action

The Action measures the checked-out grammar, writes SARIF, and adds a feature diff to
the job summary. On a pull request it updates one bot comment for the same workflow,
job and output path. No baseline file needs to be committed.

```yaml
name: Grammar features
on: [pull_request, push]

permissions:
  contents: read
  pull-requests: write

jobs:
  grammar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ydah/gramin@main
        with:
          files: |
            grammar/parser.y
          frontend: yacc-family
          dialect: bison
          source-root: grammar
          analysis: lr
```

Pin the Action to a reviewed release tag or commit for production workflows.
The Action sets up Node.js 24 and uses its pinned CLI version from the public npm
registry. It runs the CLI in a temporary directory, ignores npm lifecycle scripts,
and does not load the checked-out repository's npm configuration.

## Baseline and failure policies

- For `pull_request`, the baseline is the merge-base of the PR base SHA and the
  checked-out `HEAD`.
- For `push`, the baseline is the merge-base of the event's previous SHA and `HEAD`.
  An initial push has no automatic baseline.
- For other events, set `baseline` to a workspace-relative features JSON file when
  a comparison is needed. An explicit baseline always takes precedence.
- Shallow checkouts are fetched when the merge-base is unavailable. `fetch-depth: 0`
  on checkout avoids that fetch. Fetch credentials are supplied only to that Git
  process and are never written to repository configuration.

The baseline grammar files are read from Git into a temporary directory. The Action
does not check out or execute source code from the base revision. Frontend, dialect,
source-root normalization and analysis mode are the same for both measurements.
Grammar actions, predicates and target-language code are never executed.

If a selected grammar file is absent or is a symlink at the merge-base, or baseline
analysis fails, the Action shows the reason and reports the current measurement.
It does not fabricate an empty baseline. `fail-on-regression: true` requires a
measurable baseline and fails if one cannot be obtained.

`fail-on` retains the CLI's `error` (default), `warning`, or `none` diagnostic
threshold. `fail-on-regression` additionally fails on tracked, comparable feature
increases. Reports, the summary, and the comment are written before a diagnostic or
regression failure ends the step. A fatal head-analysis failure stops the Action.
See [feature diff semantics](diff.md) for comparison gates and skipped metrics.

## Inputs and output

| Input | Default | Meaning |
|---|---|---|
| `files` | required | Newline-separated, workspace-relative grammar file paths; multiple files form one grammar |
| `baseline` | automatic | Workspace-relative features JSON override |
| `frontend` | detection | Built-in frontend identifier |
| `dialect` | frontend default | Dialect passed to the frontend |
| `source-root` | `.` | Workspace-relative root for stable source names |
| `analysis` | none | Set `lr` to include raw SLR metrics |
| `comment` | `true` | Update a PR comment when running on `pull_request` |
| `fail-on` | `error` | Diagnostic failure threshold |
| `fail-on-regression` | `false` | Require a baseline and fail on tracked increases |
| `output` | `gramin.sarif` | Workspace-relative SARIF destination; its parent directory must exist |

The `report` output is the SARIF path. Input paths and the output must stay inside
the workspace; the output cannot overwrite an input grammar or explicit baseline.
The summary is appended to `$GITHUB_STEP_SUMMARY`. Long comments and summaries are
truncated at complete lines with a notice; the SARIF report remains available.

## Pull requests from forks

The Action uses the workflow's `github.token` and updates comments authored by
`github-actions[bot]`. Comments need `pull-requests: write` (or `issues: write`). GitHub usually gives fork
pull requests a read-only token. When commenting is unavailable, the Action emits a
warning and retains the job summary and SARIF; successful analysis still succeeds.
Set `comment: false` to disable comment requests. Use the normal `pull_request`
event for this workflow; a privileged `pull_request_target` workflow is unnecessary.
