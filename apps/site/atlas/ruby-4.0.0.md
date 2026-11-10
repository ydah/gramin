# Ruby 4.0.0

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/ruby-4.0.0.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [Ruby 4.0.0](./ruby-4.0.0) | 244 | 714 | 137 | 14 | 1377 |

## Source and provenance

- Repository: [ruby/ruby](https://github.com/ruby/ruby)
- Commit: [`553f1675f3a9cece340b90f374a4245dccac2272`](https://github.com/ruby/ruby/commit/553f1675f3a9cece340b90f374a4245dccac2272)
- Release tag: `v4.0.0`
- License: [Ruby License or BSD 2-Clause; see COPYING](https://github.com/ruby/ruby/blob/553f1675f3a9cece340b90f374a4245dccac2272/COPYING)
- Frontend: `yacc-family`, dialect `lrama`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [parse.y](https://raw.githubusercontent.com/ruby/ruby/553f1675f3a9cece340b90f374a4245dccac2272/parse.y) | 518935 | `c279ac5b08b17abdf02ce28ccdc7e2c9ae80f16346deb1214c998d0ebf9d6a73` |

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

Parseability uses a concrete derived representation; source size and structure remain source-based. Aggregate parseability covers 292 concrete rules, including 35 parameter instances and 27 EBNF helpers.

```json
{
  "representation": "parameter-expansion-bnf-v1",
  "sourceRules": 244,
  "concreteRules": 292,
  "parameterInstances": 35,
  "ebnfHelpers": 27,
  "omittedTemplateRules": [
    "@yacc/parameterized/words/2",
    "args_tail_basic",
    "asgn",
    "compstmt",
    "def_endless_method",
    "f_kw",
    "f_kwarg",
    "f_opt",
    "f_opt_arg",
    "mlhs_items",
    "op_asgn",
    "opt_args_tail",
    "range_expr",
    "value_expr"
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
