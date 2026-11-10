# ANTLR JSON

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/antlr-json.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [ANTLR JSON](./antlr-json) | 5 | 13 | 4 | unavailable | unavailable |

## Source and provenance

- Repository: [antlr/grammars-v4](https://github.com/antlr/grammars-v4)
- Commit: [`e756f2a2ee5565a9300666f100ba6acd874664f7`](https://github.com/antlr/grammars-v4/commit/e756f2a2ee5565a9300666f100ba6acd874664f7)
- License: [Per-grammar source notices; see upstream repository](https://github.com/antlr/grammars-v4/blob/e756f2a2ee5565a9300666f100ba6acd874664f7/README.md)
- Frontend: `antlr4`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [json/JSON.g4](https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/json/JSON.g4) | 1221 | `1ec0e422caf2855be3497efaeb5e23f91adc6a65068757e2dcf83467119986f4` |

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
