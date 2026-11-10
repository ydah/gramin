# ANTLR SQLite

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/antlr-sqlite.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [ANTLR SQLite](./antlr-sqlite) | 114 | 254 | 39 | unavailable | unavailable |

## Source and provenance

- Repository: [antlr/grammars-v4](https://github.com/antlr/grammars-v4)
- Commit: [`e756f2a2ee5565a9300666f100ba6acd874664f7`](https://github.com/antlr/grammars-v4/commit/e756f2a2ee5565a9300666f100ba6acd874664f7)
- License: [Per-grammar source notices; see upstream repository](https://github.com/antlr/grammars-v4/blob/e756f2a2ee5565a9300666f100ba6acd874664f7/README.md)
- Frontend: `antlr4`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [sql/sqlite/SQLiteParser.g4](https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/sql/sqlite/SQLiteParser.g4) | 20974 | `0b2e81506c7794a065d7b542f48f232fd0d89682123106818b4bb0b635aa1186` |
| [sql/sqlite/SQLiteLexer.g4](https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/sql/sqlite/SQLiteLexer.g4) | 7500 | `19fa347a41eddc482d818549c5b06c047f52393320b8e9bdf6f783450f8d0e50` |

## Comparison context

Source capabilities remain those of the original IR:

```json
{
  "orderedChoice": false,
  "ebnfSugar": true,
  "predicates": false,
  "scannerless": false,
  "precedenceTable": false,
  "parameterizedRules": false,
  "lexerRules": true
}
```

FIRST/FOLLOW, LL(1), and raw SLR use the source representation when applicable. See the JSON for each unavailable measurement and its reason.

The JSON retains all rule vectors, diagnostics, unavailable reasons and measurement domains. Source facts, derived measurements and unavailable template-level values must not be pooled as one rule population.
