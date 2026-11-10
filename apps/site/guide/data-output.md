# CSV and batch analysis

Use `analyze-many` to measure each input as a separate grammar, or pass multiple
files to `analyze` when they belong to the same grammar.

```sh
npx @gramin/cli analyze-many first.y second.y --format csv -o grammars.csv
npx @gramin/cli analyze grammar.y --format csv -o rules.csv
```

CSV contains grammar and rule metric rows, preserving measured zeros and reasons
for unavailable values. Source metadata and comparison context accompany the data.
The [Grammar Atlas](../atlas/) publishes full JSON and CSV examples.

See the [data output contract](https://github.com/ydah/gramin/blob/main/docs/data-output.md)
for columns, escaping, and batch failure behavior.
