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

Compare saved feature documents without reparsing grammars:

```sh
gramin diff before.features.json after.features.json --features --format md
```

Both documents are validated before comparison. Comparison uses the same
capability and representation checks as grammar-input differences.
