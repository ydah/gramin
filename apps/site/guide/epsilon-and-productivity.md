---
title: Epsilon and productivity
description: Distinguish an empty production from a rule with no finite terminal derivation.
---

# Epsilon and productivity

A productive CFG rule can derive a finite sequence of terminals. That sequence
may be empty: an epsilon production is productive and nullable. A self-reference
with no terminating alternative cannot derive such a sequence.

## Two BNF examples

The [epsilon example](https://github.com/ydah/gramin/blob/main/examples/grammar-guide/epsilon.bnf)
uses an empty string as its entire right-hand side:

```text
start ::= "";
```

The [unproductive example](https://github.com/ydah/gramin/blob/main/examples/grammar-guide/unproductive.bnf)
only refers back to itself:

```text
start ::= start;
```

From a repository checkout, run `pnpm install` and `pnpm build`, then measure both
files with the bundled BNF frontend:

```sh
node packages/cli/dist/bin.js analyze examples/grammar-guide/epsilon.bnf --frontend bnf --format json
node packages/cli/dist/bin.js analyze examples/grammar-guide/unproductive.bnf --frontend bnf --format json
```

The first command exits with status 0. The second still writes a feature report
but exits with status 1 because the analyzer reports a cyclic unit-rule error.

## Read the measured values

These are the relevant fields from the actual reports:

| Field | Epsilon | Self-reference |
| --- | --- | --- |
| `structure.nullableRules` | `1` | `0` |
| `structure.unproductiveSymbols` | `[]` | `["start"]` |
| `structure.shortestDerivation` | `[{"rule":"start","length":0}]` | `[]` |
| `structure.shortestDerivationUnknown` | `[]` | `["start"]` |
| `shortestDerivation` in the `start` rule vector | `0` | omitted |

Shortest derivation length counts terminals. The epsilon rule's zero means it can
derive the empty sequence. The self-referencing rule's zero nullable-rule count
means it cannot derive the empty sequence. Its missing shortest-derivation value
must stay missing; replacing it with zero would incorrectly describe an epsilon
derivation.

For this self-reference, `unproductiveSymbols` explains the lack of a finite
derivation. The analyzer can compute these CFG metrics, so the family has no
`notApplicable.shortestDerivation` reason. When the family itself is unavailable,
such as for an ordered-choice grammar, read its `notApplicable` reason instead.
See the [Peggy comparison example](/sandbox#compare-a-peggy-grammar).

## Read the diagnostics

The epsilon report has no diagnostics. The self-reference produces:

| Severity | Code | Message |
| --- | --- | --- |
| warning | `ANALYZER006_UNPRODUCTIVE_RULES` | `unproductive rules: start` |
| error | `ANALYZER007_CYCLIC_UNIT_RULES` | `cyclic unit rules: start` |

These measurements describe the represented grammar's structure. They do not
establish that a parser accepts the intended language or that embedded actions
are correct; gramin keeps actions opaque.
