---
title: Grammar IR
description: The versioned boundary between grammar frontends and analysis.
---

# Grammar IR

Grammar IR is the common, versioned representation returned by a frontend. It contains source identity, grammar rules, alternatives, symbols, locations, capabilities, and diagnostics-related structural information without action bodies.

The current schema and normative field definitions are maintained in [`docs/ir-schema.md`](https://github.com/ydah/gramin/blob/main/docs/ir-schema.md) and [`docs/rfcs/0001-grammar-ir-v1.md`](https://github.com/ydah/gramin/blob/main/docs/rfcs/0001-grammar-ir-v1.md).

## Validate before analyzing

External producers should validate their JSON before passing it to the analyzer:

```sh
gramin validate-ir grammar-ir.json
gramin analyze --ir grammar-ir.json
```

Canonical serialization is stable for equivalent IR values. Source identity is part of reproducibility, so callers should use an explicit source root or source name in generated artifacts.

## Extension boundary

If a source construct cannot be represented without losing information, preserve the supported structural facts and emit a diagnostic. Do not invent a format-independent field whose meaning changes by frontend.
