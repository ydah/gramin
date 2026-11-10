# ANTLR Java

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/antlr-java.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [ANTLR Java](./antlr-java) | 129 | 302 | 109 | unavailable | unavailable |

## Source and provenance

- Repository: [antlr/grammars-v4](https://github.com/antlr/grammars-v4)
- Commit: [`e756f2a2ee5565a9300666f100ba6acd874664f7`](https://github.com/antlr/grammars-v4/commit/e756f2a2ee5565a9300666f100ba6acd874664f7)
- License: [Per-grammar source notices; see upstream repository](https://github.com/antlr/grammars-v4/blob/e756f2a2ee5565a9300666f100ba6acd874664f7/README.md)
- Frontend: `antlr4`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [java/java/JavaParser.g4](https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/java/java/JavaParser.g4) | 19951 | `2a40776fbb3d6d30a90989e794bea5fa7488ecbe515253334847a62046fe9a09` |
| [java/java/JavaLexer.g4](https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/java/java/JavaLexer.g4) | 6305 | `b8d9b65d796197d234a1adaddd152afe491e9e411e6a6aad5300fe62df158ea6` |

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
