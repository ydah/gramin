# Ruby 3.4.0

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/ruby-3.4.0.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [Ruby 3.4.0](./ruby-3.4.0) | 237 | 725 | 135 | 5 | 1378 |

## Source and provenance

- Repository: [ruby/ruby](https://github.com/ruby/ruby)
- Commit: [`f45010833071b953744658842369e3496dfacb48`](https://github.com/ruby/ruby/commit/f45010833071b953744658842369e3496dfacb48)
- Release tag: `v3_4_0`
- License: [Ruby License or BSD 2-Clause; see COPYING](https://github.com/ruby/ruby/blob/f45010833071b953744658842369e3496dfacb48/COPYING)
- Frontend: `yacc-family`, dialect `lrama`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [parse.y](https://raw.githubusercontent.com/ruby/ruby/f45010833071b953744658842369e3496dfacb48/parse.y) | 517160 | `e61980759d6aafe014cbd1eae5e423938874487c28e90cb7a72dab2653a0dd5f` |

## Comparison context

Source capabilities remain those of the original IR:

```json
{
  "orderedChoice": false,
  "ebnfSugar": true,
  "predicates": false,
  "scannerless": false,
  "precedenceTable": true,
  "parameterizedRules": true,
  "lexerRules": false
}
```

Parseability uses a concrete derived representation; source size and structure remain source-based. Aggregate parseability covers 271 concrete rules, including 12 parameter instances and 27 EBNF helpers.

```json
{
  "representation": "parameter-expansion-bnf-v1",
  "sourceRules": 237,
  "concreteRules": 271,
  "parameterInstances": 12,
  "ebnfHelpers": 27,
  "omittedTemplateRules": [
    "@yacc/parameterized/words/2",
    "f_kwarg",
    "f_opt",
    "f_optarg",
    "opt_args_tail"
  ],
  "effectiveCapabilities": {
    "orderedChoice": false,
    "ebnfSugar": false,
    "predicates": false,
    "scannerless": false,
    "precedenceTable": true,
    "parameterizedRules": false,
    "lexerRules": false
  },
  "limits": {
    "instances": 10000,
    "nodeVisits": 1000000,
    "depth": 256,
    "keyBytes": 8388608
  }
}
```

The JSON retains all rule vectors, diagnostics, unavailable reasons and measurement domains. Source facts, derived measurements and unavailable template-level values must not be pooled as one rule population.
