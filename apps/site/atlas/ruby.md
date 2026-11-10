# Ruby development parser

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/ruby.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [Ruby development parser](./ruby) | 251 | 712 | 140 | 18 | 1440 |

## Source and provenance

- Repository: [ruby/ruby](https://github.com/ruby/ruby)
- Commit: [`33db313e855dfa83d7c66c2de6d63b9b401c32a0`](https://github.com/ruby/ruby/commit/33db313e855dfa83d7c66c2de6d63b9b401c32a0)
- License: [Ruby License or BSD 2-Clause; see COPYING](https://github.com/ruby/ruby/blob/33db313e855dfa83d7c66c2de6d63b9b401c32a0/COPYING)
- Frontend: `yacc-family`, dialect `lrama`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [parse.y](https://raw.githubusercontent.com/ruby/ruby/33db313e855dfa83d7c66c2de6d63b9b401c32a0/parse.y) | 520191 | `90ff67d6f610bacc24439dfac6c1c30ed9eb08aa8b80225c0f074947f1894bb5` |

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

Parseability uses a concrete derived representation; source size and structure remain source-based. Aggregate parseability covers 308 concrete rules, including 47 parameter instances and 28 EBNF helpers.

```json
{
  "representation": "parameter-expansion-bnf-v1",
  "sourceRules": 251,
  "concreteRules": 308,
  "parameterInstances": 47,
  "ebnfHelpers": 28,
  "omittedTemplateRules": [
    "@yacc/parameterized/words/2",
    "args-list",
    "args_tail_basic",
    "asgn",
    "compstmt",
    "def_endless_method",
    "f_args-list",
    "f_kw",
    "f_kwarg",
    "f_opt",
    "f_opt_arg",
    "mlhs_items",
    "op_asgn",
    "opt_args_tail",
    "opt_f_block_arg",
    "range_expr",
    "tail-only-args",
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
