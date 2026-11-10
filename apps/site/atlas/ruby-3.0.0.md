# Ruby 3.0.0

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/ruby-3.0.0.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [Ruby 3.0.0](./ruby-3.0.0) | 220 | 723 | 136 | unavailable | 1267 |

## Source and provenance

- Repository: [ruby/ruby](https://github.com/ruby/ruby)
- Commit: [`95aff214687a5e12c3eb57d056665741e734c188`](https://github.com/ruby/ruby/commit/95aff214687a5e12c3eb57d056665741e734c188)
- Release tag: `v3_0_0`
- License: [Ruby License or BSD 2-Clause; see COPYING](https://github.com/ruby/ruby/blob/95aff214687a5e12c3eb57d056665741e734c188/COPYING)
- Frontend: `yacc-family`, dialect `bison`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [parse.y](https://raw.githubusercontent.com/ruby/ruby/95aff214687a5e12c3eb57d056665741e734c188/parse.y) | 338297 | `9fe9dfb180778fa448f79c4451cc77d5c993adcb51c447e615f07e584f7a4e43` |

## Comparison context

Source capabilities remain those of the original IR:

```json
{
  "orderedChoice": false,
  "ebnfSugar": false,
  "predicates": false,
  "scannerless": false,
  "precedenceTable": true,
  "parameterizedRules": false,
  "lexerRules": false
}
```

FIRST/FOLLOW, LL(1), and raw SLR use the source representation when applicable. See the JSON for each unavailable measurement and its reason.

The JSON retains all rule vectors, diagnostics, unavailable reasons and measurement domains. Source facts, derived measurements and unavailable template-level values must not be pooled as one rule population.
