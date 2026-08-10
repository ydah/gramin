---
title: Diagnostics
description: Interpret parser, lossy, and structural diagnostics from Gramin.
---

# Diagnostics

Diagnostics carry a severity, stable code, message, and optional source location. They may describe a fatal parse failure, a recoverable or partial result, or a lossy construct that was intentionally not represented.

When reviewing a result, distinguish:

- **error**: the requested analysis may be incomplete or invalid;
- **warning**: analysis completed with a condition that deserves review;
- **info**: useful context that does not indicate a failed analysis.

The stable catalog and location rules are maintained in [`docs/diagnostics.md`](https://github.com/ydah/gramin/blob/main/docs/diagnostics.md). Consumers should route by code and severity rather than matching message text.

An automatic frontend detection tie is an intentional fatal condition. Select a frontend explicitly so the result is reproducible.
