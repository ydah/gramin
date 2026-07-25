# 0001: Use a TypeScript monorepo with schema-first contracts

- Status: Accepted
- Date: 2026-07-25

## Context

Grammar IR and features are versioned JSON contracts shared by format-specific frontends,
the analyzer, reporters, the CLI, and eventually external processes. The initial contract
will change across several packages while new grammar families test its generality. Runtime
validation must reject untrusted documents, including canonical-form violations that JSON
Schema cannot express.

The implementation needs strict discriminated unions, a Node.js CLI, deterministic JSON,
and packages that can later be published or split into separate repositories.

## Decision

Use Node.js 20 or newer, TypeScript with strict compiler options, and pnpm workspaces.
Keep `@gramin/core` as the only owner of Grammar IR and features contracts. Use TypeBox
definitions as the shared source for TypeScript types and Draft 2020-12-compatible JSON
Schemas, Ajv for structural validation, and a separate canonical-form pass for cross-field
and tree-position invariants.

Keep `core <- (frontend-* | analyzer | reporter) <- cli` as the only package dependency
direction. Run a repository boundary checker as part of linting to reject lateral and deep
imports.

## Consequences

- Contract changes can update all affected packages and golden fixtures atomically.
- External implementations can consume schemas without using TypeScript.
- Structural schemas and semantic canonicalization checks have distinct responsibilities
  and must be tested together.
- A frontend can later move to another language or repository without changing the JSON
  boundary.
- The monorepo carries shared TypeScript and pnpm tooling until package release cycles or
  implementation languages justify separation.
