# Feature data output

`analyze` keeps files belonging to one grammar together, such as an ANTLR parser
and its lexer. `analyze-many` treats each input file as a separate grammar:

```sh
gramin analyze parser.g4 lexer.g4 --frontend antlr4 --format json
gramin analyze-many first.y second.y --frontend yacc-family --format json
gramin analyze-many first.y second.y --frontend yacc-family --format csv -o grammars.csv
gramin analyze grammar.y --format csv -o rules.csv
```

Batch JSON contains `grammars`, an array of `{name, features}` documents. Analysis
options apply to every input. Use `--source-root` to make names relative to a
repository. Batch mode accepts JSON or CSV; a shared `--source-name`, `--ir`, or
baseline would be ambiguous and is rejected. Any unreadable or invalid input
fails the command without writing a partial collection. Diagnostic thresholds
still determine the exit status of a successfully measured collection.

CSV uses one row per metric with the columns `grammar`, `scope`, `rule`, `metric`,
`value`, and `notApplicable`. `scope` is `grammar` or `rule`. Aggregate metric paths
use dots; rule metrics use their vector field names. Arrays remain JSON in one
cell. Missing measurements carry their reason in `notApplicable`, with an empty
value cell. A measured zero remains `0`. Source metadata, capabilities, feature
version, and derived parseability context are included as aggregate rows.

CSV is UTF-8 with a header and CRLF record separators. Quotes, commas, and
newlines are escaped. Text cells beginning with a spreadsheet formula prefix
(`=`, `+`, `-`, or `@`, including after whitespace) receive a leading apostrophe.
Numeric cells retain their numeric values. Grammar and metric ordering is
deterministic.

## Import rule metrics with Python

Python's standard-library `csv.DictReader` preserves the CSV columns without a
dataframe dependency. This example pivots the integer metrics `fanIn` and
`firstSetSize` by `(grammar, rule)`:

```python
import csv

rules = {}
unavailable = {}
with open("rules.csv", encoding="utf-8", newline="") as stream:
    for row in csv.DictReader(stream):
        grammar, scope, rule, metric = (row[key] for key in ("grammar", "scope", "rule", "metric"))
        if row["notApplicable"]:
            unavailable[(grammar, scope, rule, metric)] = row["notApplicable"]
        if scope != "rule" or metric not in {"fanIn", "firstSetSize"}:
            continue
        value = int(row["value"]) if row["value"] != "" else None
        rules.setdefault((grammar, rule), {})[metric] = value
```

The explicit empty-string check keeps measured `0` as an integer and an empty
value as `None`. The separate `unavailable` mapping retains the reason and its
grammar, scope, rule, and metric. An optional rule metric can also have no row at
all: the Peggy example omits rule-level `firstSetSize`, with the explanation at
the aggregate path `parseability.firstSetSize`. Do not fill that missing entry
with zero or infer a reason when none was supplied.

The [runnable example](../examples/csv-python/read_rules.py) and its
[four-row fixture](../examples/csv-python/rules.csv) use an epsilon BNF grammar
and a Peggy ordered choice. From the repository root, build and generate the
full report with the exact command below. Installed CLI users can replace
`node packages/cli/dist/bin.js` with `gramin`.

```sh
pnpm build
node packages/cli/dist/bin.js analyze-many \
  examples/csv-python/empty.bnf examples/csv-python/@choice.peggy \
  --source-root examples/csv-python --format csv \
  -o examples/csv-python/features.csv
python3 examples/csv-python/read_rules.py examples/csv-python/rules.csv
python3 examples/csv-python/check.py
```

The fixture retains only the two selected rule metrics and the unavailable
aggregate FIRST-set row from that report. The reader also accepts the full report.
`check.py` reruns the analysis and
asserts that this selection still matches, then checks zero, missing and empty
values, and the preserved reason. The checked fixture prints:

```text
'@choice.peggy/start: {'fanIn': 0}
empty.bnf/start: {'fanIn': 0, 'firstSetSize': 0}
'@choice.peggy [grammar:] parseability.firstSetSize: orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply
```

The leading apostrophe in `'@choice.peggy` is part of the CSV cell, added because
the grammar filename begins with a spreadsheet formula prefix. `DictReader`
retains it; keep that escaped name as the pivot key. Do not strip apostrophes
automatically when passing imported text to a spreadsheet.

## Compare saved features

Compare saved feature documents without reparsing grammars:

```sh
gramin diff before.features.json after.features.json --features --format md
```

Both documents are validated before comparison. Comparison uses the same
capability and representation checks as grammar-input differences.
