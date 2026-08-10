---
title: External frontend protocol
description: Connect an external grammar frontend to Gramin’s IR boundary.
---

# External frontend protocol

An external frontend lets a separately maintained parser grammar implementation feed validated Grammar IR to Gramin. The protocol keeps source parsing outside the analyzer while preserving one contract for downstream reports.

The complete request, response, executable rules, and error behavior are documented in [`docs/frontend-protocol.md`](https://github.com/ydah/gramin/blob/main/docs/frontend-protocol.md).

## Integration checklist

1. Emit the supported Grammar IR version.
2. Include stable source names and locations.
3. Declare capabilities honestly; downstream metric interpretation depends on them.
4. Never include semantic-action bodies in IR.
5. Emit diagnostics for unsupported or lossy syntax.
6. Validate the result before invoking the analyzer.

The browser sandbox intentionally does not execute external frontend commands. Use the CLI protocol for that integration and keep the browser path limited to bundled, browser-safe frontends.
