---
title: Metric comparability
description: Interpret Gramin metrics across formats with their capability context.
---

# Metric comparability

Gramin does not collapse grammar quality into one score. A count can be mechanically comparable while its meaning still depends on how the author expressed the grammar.

| Class | Meaning | UI treatment |
| --- | --- | --- |
| **A** | Cross-format comparable under the metric definition | Show in the primary comparison |
| **B** | Context-dependent; capability or representation affects interpretation | Show with a context badge |
| **C** | Format-specific or heuristic | Keep in an advanced section |

Examples include rule and alternative counts as Class A candidates, recursion and nullable analysis as context-dependent measurements, and format-specific sugar or precedence details as Class C measurements.

## `notApplicable` is data

If a frontend cannot define a metric for its representation, the feature retains a `notApplicable` state and reason. The UI must not render that state as `0`, because zero says the property was measured and absent.

## Comparing revisions

Before comparing values, compare the representation context: frontend, capabilities, source identity, and relevant options. If that context changed, explain the context change before describing a number as an increase or decrease.

The normative definitions live in the [metrics catalog](https://github.com/ydah/gramin/blob/main/docs/metrics-catalog.md) and [cross-format notes](https://github.com/ydah/gramin/blob/main/docs/cross-format-notes.md).
