# Perl parser

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[This grammar as JSON](/atlas/perl.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [Perl parser](./perl) | 114 | 348 | 90 | unavailable | 681 |

## Source and provenance

- Repository: [Perl/perl5](https://github.com/Perl/perl5)
- Commit: [`44f4945c88a0598be10ee67b689de6ff4bf84bc1`](https://github.com/Perl/perl5/commit/44f4945c88a0598be10ee67b689de6ff4bf84bc1)
- License: [Artistic License or GNU General Public License; see README](https://github.com/Perl/perl5/blob/44f4945c88a0598be10ee67b689de6ff4bf84bc1/README)
- Frontend: `yacc-family`, dialect `bison`; analysis: `lr`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
| [perly.y](https://raw.githubusercontent.com/Perl/perl5/44f4945c88a0598be10ee67b689de6ff4bf84bc1/perly.y) | 53716 | `783af8ff7ff42fd7313d85df8bbde58d7480e4964bb41ce7b92a5039a7286074` |

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
