# Ruby parse.y chronicle

These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.

[Full JSON dataset](/atlas/atlas.json) · [Full CSV dataset](/atlas/atlas.csv)

![Source rule counts across the sampled Ruby releases](/atlas/ruby-rules.svg)

| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |
|---|---:|---:|---:|---:|---:|
| [Ruby 2.7.0](./ruby-2.7.0) | 208 | 700 | 132 | unavailable | 1207 |
| [Ruby 3.0.0](./ruby-3.0.0) | 220 | 723 | 136 | unavailable | 1267 |
| [Ruby 3.2.0](./ruby-3.2.0) | 223 | 730 | 137 | unavailable | 1275 |
| [Ruby 3.3.0](./ruby-3.3.0) | 239 | 745 | 141 | unavailable | 1323 |
| [Ruby 3.4.0](./ruby-3.4.0) | 237 | 725 | 138 | 5 | 1378 |
| [Ruby 4.0.0](./ruby-4.0.0) | 244 | 714 | 141 | 14 | 1377 |

## Reading the history

These snapshots sample release tags rather than every change. Ruby's [3.3.0 release notes](https://www.ruby-lang.org/en/news/2023/12/25/ruby-3-3-0-released/) document the switch from Bison to Lrama and parameterized-rule support. The table records what this frontend captures in each pinned `parse.y`; it does not attribute every numeric change to that transition. Ruby's alternative Prism parser is outside this dataset.

Rule and alternative counts describe source structure. A parameterized representation can change those counts without a corresponding change in the recognized language. FIRST/FOLLOW, LL(1), and raw SLR may instead use the recorded concrete expansion, while the source structural measurements retain their original population. Follow each release page for its capabilities, raw data and unavailable reasons.

Comparability depends on the feature version, capability flags and representation policy. A timeline is contextual evidence, not permission to subtract every column across all releases.
