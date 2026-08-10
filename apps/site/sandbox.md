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
- **Compare before / after** analyzes two revisions with the same frontend and reports feature changes and tracked regressions.

The first version keeps the surface deliberately small: one editable source file, bounded LLM digest output, and copy/download actions for the generated reports. External frontend executables, parser generation, semantic action execution, and automatic LLM calls are not available in the browser.

## Privacy and limits

Grammar contents are analyzed locally in this browser and are not sent by the sandbox. The page does not persist source in `localStorage`, embed it in a URL, or send it to analytics. A browser worker keeps analysis off the UI thread; for large grammars, use the CLI where you can configure files and resource limits explicitly.

The browser path accepts at most 250,000 source characters across its input files and stops a worker after 10 seconds. These are interaction safeguards, not parser correctness guarantees.

The CLI equivalent is shown after a successful analysis. For CI and multi-file grammars, continue with [Getting started](/guide/getting-started) and [GitHub Actions](/guide/github-actions).
