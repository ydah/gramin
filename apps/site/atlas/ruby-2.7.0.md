# Ruby 2.7.0

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/ruby-2.7.0.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [Ruby 2.7.0](./ruby-2.7.0) | 208 | 700 | 132 | unavailable | 1207 |

## Source and provenance

- Repository: [ruby/ruby](https://github.com/ruby/ruby)
- Commit: [`647ee6f091eafcce70ffb75ddf7e121e192ab217`](https://github.com/ruby/ruby/commit/647ee6f091eafcce70ffb75ddf7e121e192ab217)
- Release tag: `v2_7_0`
- License: [Ruby License or BSD 2-Clause; see COPYING](https://github.com/ruby/ruby/blob/647ee6f091eafcce70ffb75ddf7e121e192ab217/COPYING)
- Frontend: `yacc-family`, dialect `bison`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [parse.y](https://raw.githubusercontent.com/ruby/ruby/647ee6f091eafcce70ffb75ddf7e121e192ab217/parse.y) | 320335 | `008fb5b108a58a44fa7401d3e7838a7c213d8a206871e794eb030d775a38ca86` |

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
