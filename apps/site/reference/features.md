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
- source nullable-repetition and indirect-left-recursion counts;
- FIRST/FOLLOW, LL(1), declared conflict expectations, and optional raw SLR involvement;
- capabilities and diagnostics.

Features 0.8 keeps source measurements and source rule rows unchanged when parameterized
rules can be expanded into a finite concrete BNF grammar. `parseability.context` records
that derived domain and policy. Templates omit concrete local values, generated helpers
are excluded from source rows, and aggregate parseability values can therefore differ
from source-row sums. Missing rule bodies or exceeded expansion limits produce
`notApplicable` reasons. Raw SLR counts do not apply precedence resolution or predict a
generator's conflict report; declared `%expect` counts remain separate source facts.

The schema is documented in [`docs/features-schema.md`](https://github.com/ydah/gramin/blob/main/docs/features-schema.md). Treat the feature version as a contract: consumers should validate the version and handle additions explicitly.

## Reports

The same object can be rendered as JSON, Markdown, an LLM digest bounded by `budgetChars`, or SARIF. The LLM digest is a derived summary, not a replacement for the canonical JSON.
