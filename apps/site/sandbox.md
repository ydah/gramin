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

## Privacy and limits

Grammar contents are analyzed locally in this browser and are not sent by the sandbox. The page does not persist source in `localStorage`, embed it in a URL, or send it to analytics. A browser worker keeps analysis off the UI thread; for large grammars, use the CLI where you can configure files and resource limits explicitly.

The browser path accepts at most 250,000 source characters across its input files and stops a worker after 10 seconds. These are interaction safeguards, not parser correctness guarantees.

The CLI equivalent is shown after a successful analysis. For CI and multi-file grammars, continue with [Getting started](/guide/getting-started) and [GitHub Actions](/guide/github-actions).
