# PHP Zend parser

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/php.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [PHP Zend parser](./php) | 177 | 624 | 119 | unavailable | 1192 |

## Source and provenance

- Repository: [php/php-src](https://github.com/php/php-src)
- Commit: [`f77523b538bd39c94144c5b8edb85e5230369d45`](https://github.com/php/php-src/commit/f77523b538bd39c94144c5b8edb85e5230369d45)
- License: [PHP License 3.01; see LICENSE](https://github.com/php/php-src/blob/f77523b538bd39c94144c5b8edb85e5230369d45/LICENSE)
- Frontend: `yacc-family`, dialect `bison`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [Zend/zend_language_parser.y](https://raw.githubusercontent.com/php/php-src/f77523b538bd39c94144c5b8edb85e5230369d45/Zend/zend_language_parser.y) | 68120 | `afb7ad325d4bd7ca4bb037c96dd31e8afdd0652469f0248cc4139a475f0d5e98` |

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
