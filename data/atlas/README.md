# Grammar Atlas inputs

`manifest.json` pins six representative development grammars and six Ruby release
grammars. Multi-file ANTLR parser/lexer pairs form one measurement. Ruby release
tags were resolved through the official `ruby/ruby` Git references; the immutable
commit, not a moving tag, is used for downloads.

Regenerate the published snapshot:

```sh
pnpm build
node scripts/atlas.mjs --fetch
```

`--fetch` downloads only the manifest's immutable GitHub source files, rejects
inputs above 5 MiB per file, and verifies every SHA-256 before parsing. It keeps
source files in the ignored `fixtures/downloaded` cache. It never executes the
grammars, source actions, predicates, or upstream build commands. With a populated
cache, `node scripts/atlas.mjs` regenerates the same outputs without network
access. No timestamp is inserted, so byte comparisons remain meaningful.

Generated files are `apps/site/public/atlas/atlas.json`, `atlas.csv`, individual
grammar JSON files, a Ruby source-rule chart, and `apps/site/atlas/*.md` pages.
The JSON keeps full feature documents, rule vectors, unavailable reasons, source
hashes, options and software/schema versions. CSV uses the public reporter's
long-table representation, including source and derived measurement context.
Snapshots should be regenerated when analyzer behavior or versions change.

Weekly publication remeasures these pinned inputs with the current gramin
implementation. It does not silently advance upstream grammar revisions. To
update a source, resolve the intended upstream ref, record the full commit and
new file hashes, inspect source and measurement changes, then commit the manifest
and regenerated snapshot together. Keep historical Ruby release entries fixed.

Only derived measurements are redistributed here. Every entry links to its
upstream source and license notices. The ANTLR grammars have per-file authors and
notices; do not assume that one repository-wide license replaces those notices.

The timeline describes captured `parse.y` representations. Ruby's official
[3.3.0 release notes](https://www.ruby-lang.org/en/news/2023/12/25/ruby-3-3-0-released/)
document the switch to Lrama. Numeric changes in these snapshots do not establish
their cause or measure parser performance.
