# Grammar IR v1

The normative machine-readable contract is
`packages/core/schema/grammar-ir-v1.schema.json`. `@gramin/core` exports the same
schema as `GrammarIRSchemaDocument`, its TypeScript type as `GrammarIR`, and the
`validateIR` boundary.

## Envelope

A document contains:

- semantic version `irVersion`;
- source format, optional dialect and file names, and frontend identity;
- explicit capability flags;
- start symbols, terminal and external symbol declarations, precedence levels, rules,
  and diagnostics.

Expressions form a discriminated union of `symbol`, `terminal`, `seq`, `choice`, `opt`,
`star`, `plus`, `predicate`, `charClass`, `anyChar`, `midRuleAction`, and `group`.
Actions preserve only presence and source length; source code is never retained or run.

## Canonical form

`validateIR` applies JSON Schema and then enforces these tree invariants:

1. A choice directly below a rule is flattened into `Rule.alternatives`.
2. `Alternative.items` is an implicit sequence, so it cannot directly contain `seq`.
   A `seq` cannot directly contain another `seq`.
3. A `group` cannot occur directly in `Alternative.items`.
4. `capabilities.orderedChoice` is true exactly when an ordered choice occurs.
5. `capabilities.scannerless` is true exactly when `charClass` or `anyChar` occurs.
6. Frontends resolve a declared literal alias to its named terminal before emitting IR.

`serializeCanonical` sorts object keys by byte order and can remove all `loc` properties.
Arrays retain their contract-defined order.

## Compatibility

Additive compatible changes increment the minor version. Removal or semantic changes
increment the major version. Analyzer 1.x accepts structurally compatible v0.x documents
with a migration warning; this compatibility ends no earlier than Analyzer 2.0. The
historical `grammar-ir-v0.2.schema.json` remains packaged for old producers.

A contract change requires an RFC plus coordinated frontend, analyzer, documentation, and
golden-fixture updates. See
[`RFC 0001`](./rfcs/0001-grammar-ir-v1.md) for the v1 evidence and migration policy.
