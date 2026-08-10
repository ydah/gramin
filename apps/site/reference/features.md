---
title: Grammar Features
description: The deterministic feature object produced from Grammar IR.
---

# Grammar Features

`analyzeGrammar` consumes validated Grammar IR and returns the versioned feature object. Reporters do not re-parse source and do not calculate separate metrics.

Feature groups include:

- size: rules, alternatives, terminals, unresolved symbols, and largest rules;
- structure: reachability, productivity, recursion, dependency depth, and cycles;
- precedence and lexicon details;
- EBNF sugar and action presence;
- capabilities and diagnostics.

The schema is documented in [`docs/features-schema.md`](https://github.com/ydah/gramin/blob/main/docs/features-schema.md). Treat the feature version as a contract: consumers should validate the version and handle additions explicitly.

## Reports

The same object can be rendered as JSON, Markdown, an LLM digest bounded by `budgetChars`, or SARIF. The LLM digest is a derived summary, not a replacement for the canonical JSON.
