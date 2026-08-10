---
title: Supported formats
description: Frontend support, capabilities, and limits for Gramin grammar formats.
---

# Supported formats

<SupportMatrix />

The matrix describes the frontend boundary, not a claim that all dialect extensions are lossless. A parser frontend may emit diagnostics for syntax it can recognize only partially. Always read diagnostics and capability fields with the metrics.

## Frontend selection

Use `gramin detect` to inspect candidates, but pass `--frontend` when detection is ambiguous. The browser sandbox follows the same rule: `Auto` refuses a tie instead of silently selecting a frontend.

## Format notes

- **Yacc family** covers POSIX Yacc, Bison, and Lrama constructs supported by the yacc frontend.
- **BNF / EBNF** represents grammar productions and EBNF sugar without pretending that every notation has the same semantics.
- **ANTLR4** supports parser and lexer grammar boundaries and split grammar files.
- **Menhir** includes supported standard-library calls and reports unsupported extensions as diagnostics.
- **Peggy / PEG.js** preserves ordered-choice and scannerless capability context.

For exact syntax and lossiness, consult the frontend package README and the [frontend protocol](/reference/frontend-protocol).
