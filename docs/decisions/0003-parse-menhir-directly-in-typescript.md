# 0003: Parse Menhir grammar structure directly in TypeScript

- Status: Accepted
- Date: 2026-07-25

## Context

Menhir can be integrated by parsing `.mly` files in the existing TypeScript process or by
building an OCaml executable that uses Menhir's own parser and implements the external
frontend protocol. Reusing Menhir internals would provide the broadest syntax coverage,
but it adds an OCaml compiler, version coupling, and another release artifact to the
default CLI installation.

The required analysis is structural. Semantic actions remain opaque, and parameterized
rules, inline rules, precedence declarations, and standard-library calls map directly to
existing Grammar IR fields.

## Decision

Provide an in-process TypeScript frontend for the documented structural Menhir subset.
Keep it independent of the Yacc frontend so package boundaries remain
`core <- frontend-menhir <- cli`. Preserve action presence and length without parsing or
executing OCaml.

Use `externalSymbols(origin: "stdlib")` for recognized Menhir standard-library calls.
Use the external frontend protocol when a project needs exact expansion of unsupported
Menhir extensions or wants to reuse a pinned OCaml/Menhir implementation.

## Consequences

- The standard CLI analyzes common `.mly` files without an OCaml toolchain.
- Distribution, sandboxing, and deterministic validation match the other in-process
  frontends.
- The TypeScript lexer must track OCaml comments, strings, and balanced actions.
- New or uncommon Menhir syntax may initially produce a loss diagnostic instead of an
  exact mapping.
- An OCaml implementation can be added later without changing Analyzer or Reporter.
