---
title: Metrics catalog
description: Definitions and comparability classes for Gramin metrics.
---

# Metrics catalog

Metrics are facts with definitions, not an implied ranking of grammar quality. Each metric has a scope and interpretation context.

| Group | Examples | Typical class |
| --- | --- | --- |
| Size | rules, alternatives, terminals | A |
| Structure | reachable, recursive, productive rules | A or B |
| Representation | ordered choice, EBNF sugar, precedence | B or C |
| Review signals | unresolved symbols, diagnostics | A for the same policy |

The complete definitions, nullability rules, and `notApplicable` cases are in the [normative metrics catalog](https://github.com/ydah/gramin/blob/main/docs/metrics-catalog.md). Cross-format guidance is in the [cross-format notes](https://github.com/ydah/gramin/blob/main/docs/cross-format-notes.md).

Do not render `notApplicable` as zero. Do not compare Class B or C values without preserving frontend capabilities and representation context.
