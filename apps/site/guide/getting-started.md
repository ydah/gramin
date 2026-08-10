---
title: Getting started
description: Install Gramin and analyze your first parser grammar.
---

# Getting started

Gramin turns parser grammar source into a common Grammar IR and a deterministic feature report. It is a structural analysis toolkit, not a parser generator.

## Analyze a grammar

Requires Node.js 20 or newer:

```sh
npx @gramin/cli analyze grammar.y
npx @gramin/cli analyze grammar.y --format md
npx @gramin/cli analyze grammar.y --format llm --budget-chars 8000
```

Use an explicit frontend when a filename is ambiguous or when automatic detection reports more than one plausible format:

```sh
npx @gramin/cli analyze grammar.y --frontend yacc-family
npx @gramin/cli analyze Json.g4 --frontend antlr4
```

Automatic detection never silently chooses between tied candidates. That makes a result reproducible and prevents a filename or short header from selecting the wrong grammar family.

## Inspect the intermediate representation

The IR is a versioned, machine-readable boundary:

```sh
gramin ir grammar.y > grammar-ir.json
gramin validate-ir grammar-ir.json
gramin analyze --ir grammar-ir.json --format json
```

Use the IR when you want to connect an external frontend, cache parsing separately, or build a tool on top of the stable schema.

## Choose an output

Every renderer starts from the same validated feature object:

| Output | Best for |
| --- | --- |
| `json` | dashboards, scripts, and snapshots |
| `md` | pull-request review and human-readable reports |
| `llm` | bounded context for an assistant you control |
| `sarif` | GitHub Code Scanning and CI annotations |

See [How it works](/guide/how-it-works) for the boundary between parsing, analysis, and reporting.
