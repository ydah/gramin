---
title: Safety and boundaries
description: Understand what Gramin executes, stores, and sends.
---

# Safety and boundaries

Gramin treats grammar files as untrusted source text and analyzes their structure.

- Semantic actions and target code are never executed by the parser frontends.
- Action bodies are not retained in Grammar IR; only structural presence, position, and length may be recorded.
- The browser sandbox runs locally in a Web Worker and does not send grammar contents to an API.
- The browser build does not invoke external frontend executables.
- The sandbox does not persist source to `localStorage`, put it in a URL, or call an LLM service.
- Lossy or unsupported syntax produces diagnostics instead of disappearing silently.

These boundaries do not mean that every grammar is semantically safe or correct. They mean the analysis path does not evaluate grammar-provided code. For the CLI’s full behavior and limitations, see the repository’s [known limitations](https://github.com/ydah/gramin/blob/main/docs/known-limitations.md).
