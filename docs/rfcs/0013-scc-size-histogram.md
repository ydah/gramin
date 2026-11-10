# RFC 0013: Source SCC size histogram

- Status: Accepted
- Date: 2026-11-10

## Definition

Add optional `structure.sccSizeHistogram`, an array of `{size, count}` bins. `size`
is the positive number of rules in a strongly connected component of the source
dependency graph; `count` is the positive number of components of that size.
Producers emit one bin per observed size, sorted by increasing size.

Include every defined source rule, including unreachable rules, singleton
components, self-loop components, and parameterized source definitions. References
outside the defined rule set do not add graph nodes. Reuse the dependency graph
and complete SCC partition already computed for structural measurements; concrete
parameter instances and EBNF helpers are outside this population.

Classification is **E / B**: an exact graph measurement, comparable under matching
source capability context. This graph fact remains applicable to ordered choice,
predicates, and parameterized source representations. It does not establish CFG
recognition semantics or language equivalence.

The empty grammar yields `[]`, a known empty population. Omission means that an
older producer did not record the measurement. No zero-size or zero-count bins
are emitted. There is no truncation or new analysis limit.

## Invariants and example

`sum(size * count)` equals the number of distinct source rules. `sum(count)` equals
the total number of SCCs. Bins with `size >= 2` sum to the existing mutual-only
`recursionSccCount`; legacy `largestSccSize` retains its mutual-only definition.

For components `{A,B}`, `{C,D,E}`, `{F}`, `{G}`, and `{H}`, including an `F -> F`
self-loop, the histogram is `[{size:1,count:3},{size:2,count:1},{size:3,count:1}]`.
Changing starts or traversal order does not change the partition.

## Compatibility and display

The field is optional so historical feature documents remain readable. Preserve
the historical schema artifacts. Generic JSON, CSV, and Markdown renderers carry
the bins; context-aware differences apply the same source B gate as other
structural SCC measurements.

The sandbox charts component count against component size and retains exact
numeric labels. An absent histogram is unavailable; an empty histogram reports
zero components. It never presents a maximum as the complete distribution.

## Validation

Hand-calculated tests cover an empty grammar, isolated nodes, self-loops,
unreachable multi-rule components, external references, reordered input, and
parameterized source definitions. Schema tests reject nonpositive or fractional
values, missing fields, and extra fields. Chart tests distinguish empty and
unrecorded populations.
