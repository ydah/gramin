# Grammar Atlas

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[Full JSON dataset](/atlas/atlas.json) · [Full CSV dataset](/atlas/atlas.csv)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [ANTLR Java](./antlr-java) | 129 | 302 | 109 | unavailable | unavailable |
| [ANTLR JSON](./antlr-json) | 5 | 13 | 4 | unavailable | unavailable |
| [ANTLR SQLite](./antlr-sqlite) | 114 | 254 | 39 | unavailable | unavailable |
| [Perl parser](./perl) | 114 | 348 | 90 | unavailable | 681 |
| [PHP Zend parser](./php) | 177 | 624 | 119 | unavailable | 1192 |
| [Ruby development parser](./ruby) | 251 | 712 | 140 | 18 | 1440 |

[Explore the Ruby parse.y chronicle](./ruby-history).

## Reproduce and compare

Every page records an immutable upstream commit, input SHA-256 hashes, the frontend, and the effective measurement context. Downloaded source remains in an ignored cache; only derived measurements are published. The source links retain access to upstream copyright and license notices.

Measurements are regenerated weekly from the pinned manifest and the current gramin implementation. To change the sampled source revisions, update the manifest commits and hashes through review. Identical source, software and options produce identical dataset bytes; timestamps are deliberately omitted.

Class A refers to representation-level counts. Class B requires matching capability/representation context; class C also depends on source conventions. Use the [sandbox](../sandbox) or `gramin diff --features` to apply the comparison gates. Missing values remain unavailable.

Dataset contract 1.0.0; analyzer 1.0.1, Grammar IR 1.4.0, features 1.0.0.
