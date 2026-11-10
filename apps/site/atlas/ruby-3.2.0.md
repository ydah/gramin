# Ruby 3.2.0

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/ruby-3.2.0.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [Ruby 3.2.0](./ruby-3.2.0) | 223 | 730 | 137 | unavailable | 1275 |

## Source and provenance

- Repository: [ruby/ruby](https://github.com/ruby/ruby)
- Commit: [`a528908271c678360d2d8ca232c178e7cdd340b4`](https://github.com/ruby/ruby/commit/a528908271c678360d2d8ca232c178e7cdd340b4)
- Release tag: `v3_2_0`
- License: [Ruby License or BSD 2-Clause; see COPYING](https://github.com/ruby/ruby/blob/a528908271c678360d2d8ca232c178e7cdd340b4/COPYING)
- Frontend: `yacc-family`, dialect `bison`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [parse.y](https://raw.githubusercontent.com/ruby/ruby/a528908271c678360d2d8ca232c178e7cdd340b4/parse.y) | 359546 | `cd9d083728abb271d24241347623c91d7e2bac2d063331938afc8fcad312b555` |

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
