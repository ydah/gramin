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
| Parseability | FIRST/FOLLOW sizes, LL(1) conflicts, unit-rule cycles | A or B |
| Redundancy | common prefixes, duplicates, clones, unused declarations | A or B |
| Graph shape | articulation points, bridges, betweenness, fan-in distribution | A |
| PEG | predicates, shadowing, backtracking and character classes | B or C |
| Operations and style | recovery, declarations, explicit empty rules, action references, comments, naming | B or C |
| Per-rule vectors | FIRST/FOLLOW, LL(1), width/depth, fan-in/out, start reachability | A, B, or C |
| Representation | ordered choice, EBNF sugar, precedence | B or C |
| Review signals | unresolved symbols, diagnostics | A for the same policy |

The complete definitions, nullability rules, and `notApplicable` cases are in the [normative metrics catalog](https://github.com/ydah/gramin/blob/main/docs/metrics-catalog.md). Cross-format guidance is in the [cross-format notes](https://github.com/ydah/gramin/blob/main/docs/cross-format-notes.md).

Do not render `notApplicable` as zero. Do not compare Class B or C values without preserving frontend capabilities and representation context.
