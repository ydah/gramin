---
title: Reviewing grammar changes
description: Compare structural changes without overclaiming what a metric means.
---

# Reviewing grammar changes

Generate a baseline before the change, then compare the changed grammar:

```sh
gramin analyze base.y --format json > base.features.json
gramin diff base.y changed.y --format md
gramin analyze changed.y --baseline base.features.json --fail-on-regression
```

The result separates three things:

1. representation context, such as a changed frontend capability;
2. tracked regressions, where a configured metric or issue list grew;
3. all structural changes, including changes that are not policy failures.

“Regression” is a review policy, not a proof that the grammar became semantically worse. Read the changed rules and diagnostics alongside the report.

## What to inspect first

- new error or warning diagnostics;
- unresolved, unreachable, or unproductive symbols;
- growth in recursive rules or dependency depth;
- changes to precedence and lexer/parser boundaries;
- action presence or locations, without treating action text as executable input.

For cross-format comparisons, start with Class A metrics and keep capability context beside the values. [Metric comparability](/concepts/comparability) explains why.
