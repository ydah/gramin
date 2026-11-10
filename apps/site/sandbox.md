---
title: Sandbox
description: Analyze parser grammars locally in your browser with Gramin.
---

# Sandbox

Paste a grammar, choose a frontend, and inspect the common IR and deterministic features. The sandbox runs the browser-safe frontends and analyzer in a Web Worker.

<Sandbox />

## Input modes

- **Analyze source** parses one source file with an explicit frontend or unambiguous automatic detection.
- **Analyze Grammar IR** validates an existing IR JSON document before analyzing it.
- **Compare before / after** analyzes two grammars with independently selected frontends and reports aggregate and rule-level feature changes. Comparisons with incompatible capabilities or measurement context include their reasons instead of numeric differences.

The **Charts** tab shows alternatives-per-rule and right-hand-side-length percentiles,
the frequency of every source SCC size, the largest SCC and largest recursive component,
and searchable rule vectors. Bars include numeric labels; older feature documents without
the SCC histogram show it as unavailable. Rule charts show the largest
20 matching values; the **Features** tab retains every rule vector. In comparison mode,
choose **Before** or **After** to inspect either grammar's charts.

The editor accepts one source file per grammar, with bounded LLM digest output and
copy/download actions for generated reports. External frontend executables, parser
generation, semantic action execution, and automatic LLM calls are not available in the
browser.

## Compare a Peggy grammar

Add one alternative to this ordered-choice grammar. The checked-in
[before](https://github.com/ydah/gramin/blob/main/examples/grammar-guide/choice-before.peggy)
and [after](https://github.com/ydah/gramin/blob/main/examples/grammar-guide/choice-after.peggy)
files contain these sources.

Before:

```text
start = "x" / "y"
```

After:

```text
start = "x" / "y" / "z"
```

1. Choose `Compare before / after` as the analysis mode.
2. Set both `Before frontend` and `After frontend` to `Peggy / PEG.js`, and paste
   the sources into their corresponding editors.
3. Select `Analyze`, then open `Feature diff`.

The bundled `peggy` frontend produces these source-count changes. Both inputs
have the same capability context, so the counts can be compared directly.

| Metric | Before | After |
| --- | ---: | ---: |
| `size.rules` | 1 | 1 |
| `size.alternatives` | 2 | 3 |
| `size.terminals` | 2 | 3 |
| `perRule` alternatives for `start` | 2 | 3 |

The unchanged rule count does not appear in the diff. The `Regressions` list flags
the increases in alternatives and terminals under the tracked complexity policy.

Peggy's `/` tries alternatives in order. Both reports declare `orderedChoice: true`,
so CFG FIRST/FOLLOW, LL(1), and raw SLR measurements are unavailable. The `Features`
tab shows the after report, including this excerpt:

```json
{
  "parseability": {
    "notApplicable": {
      "firstSetSize": "orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply",
      "followSetSize": "orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply",
      "ll1Conflicts": "orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply",
      "slr": "orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply"
    }
  }
}
```

These numeric fields are omitted in both reports. Their absence from the diff
does not mean zero conflicts or zero-sized FIRST sets. To inspect the before
report, analyze its source separately. The same SLR reason remains when the CLI
explicitly requests `--analysis lr`.

From a built repository checkout, reproduce the comparison with:

```sh
node packages/cli/dist/bin.js diff examples/grammar-guide/choice-before.peggy examples/grammar-guide/choice-after.peggy --frontend peggy --format md
node packages/cli/dist/bin.js analyze examples/grammar-guide/choice-before.peggy --frontend peggy --analysis lr --format json
```

See [metric comparability](/concepts/comparability) for capability-sensitive
comparisons and [epsilon and productivity](/guide/epsilon-and-productivity) for
examples of measured zero and missing derivation values.

## Privacy and limits

Grammar contents are analyzed locally in this browser and are not sent by the sandbox. The page does not persist source in `localStorage`, embed it in a URL, or send it to analytics. A browser worker keeps analysis off the UI thread; for large grammars, use the CLI where you can configure files and resource limits explicitly.

The browser path accepts at most 250,000 source characters across its input files and stops a worker after 10 seconds. These are interaction safeguards, not parser correctness guarantees.

The CLI equivalent is shown after a successful analysis. For CI and multi-file grammars, continue with [Getting started](/guide/getting-started) and [GitHub Actions](/guide/github-actions).
