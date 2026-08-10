import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const documents = await Promise.all(
  [
    ["Yacc", "packages/frontend-yacc/fixtures/golden/json.features.json"],
    ["ANTLR4", "packages/frontend-antlr/fixtures/golden/json.features.json"],
    ["Peggy", "packages/frontend-peg/fixtures/golden/json.features.json"],
  ].map(async ([name, file]) => [name, JSON.parse(await readFile(resolve(root, file), "utf8"))]),
);
const values = Object.fromEntries(documents);
const metric = (selector) => documents.map(([name]) => selector(values[name]));
const value = (entry) => (entry === undefined ? "not applicable" : String(entry));
const pair = (selector) =>
  metric((features) => {
    const selected = selector(features);
    return `${selected.p50} / ${selected.p95}`;
  });
const triple = (selector) =>
  metric((features) => {
    const selected = selector(features);
    return selected?.opt === undefined
      ? "n/a"
      : `${selected.opt} / ${selected.star} / ${selected.plus}`;
  });

const rows = [
  ["rules", "A", metric((features) => features.size.rules)],
  ["alternatives", "A", metric((features) => features.size.alternatives)],
  ["alternatives/rule p50 / p95", "A", pair((features) => features.size.altPerRulePercentiles)],
  ["RHS length p50 / p95", "A", pair((features) => features.size.rhsLengthPercentiles)],
  ["avgRhsLength", "A", metric((features) => features.size.avgRhsLength)],
  ["maxDependencyDepth", "A", metric((features) => features.structure.maxDependencyDepth)],
  ["unresolvedSymbols", "A", metric((features) => features.size.unresolvedSymbols.count)],
  ["unreachableSymbols", "A", metric((features) => features.structure.unreachableSymbols.length)],
  ["nestedChoiceCount", "B", metric((features) => features.size.nestedChoiceCount)],
  [
    "directLeftRecursiveRules",
    "B",
    metric((features) => features.structure.directLeftRecursiveRules),
  ],
  ["recursionSccCount", "B", metric((features) => features.structure.recursionSccCount)],
  ["reachableRules", "A", metric((features) => features.structure.reachableRules)],
  [
    "recursiveRules count / ratio",
    "B",
    metric((features) => {
      const recursive = features.structure.recursiveRules;
      return `${recursive.count} / ${value(recursive.ratio)}`;
    }),
  ],
  ["nullableRules", "B", metric((features) => value(features.structure.nullableRules))],
  ["namedTokens", "B", metric((features) => features.lexicon.namedTokens)],
  ["literalOccurrences", "B", metric((features) => features.lexicon.literalOccurrences)],
  ["charClassCount", "B", metric((features) => features.lexicon.charClassCount)],
  ["opt / star / plus", "B", triple((features) => features.sugar)],
  ["action completeness", "C", metric((features) => features.actions.completeness)],
];

const table = rows
  .map(([name, classification, cells]) => `| ${name} | ${classification} | ${cells.join(" | ")} |`)
  .join("\n");
const generated = `# Cross-format comparison notes

This comparison uses three authored fixtures for the same small JSON value language:

- Yacc: \`packages/frontend-yacc/fixtures/json.y\`
- ANTLR4: \`packages/frontend-antlr/fixtures/Json.g4\`
- Peggy: \`packages/frontend-peg/fixtures/json.peggy\`

The observed table below is generated from the committed, location-stripped features
goldens. All three inputs have zero unresolved symbols and pass the same Grammar IR
canonical validator.

## Observed features

| Metric | Class | Yacc | ANTLR4 | Peggy |
|---|---:|---:|---:|---:|
${table}

## Interpretation

Class A metrics share one counting definition and can be compared, but equality is not
expected. Yacc spells list structure as two explicit left-recursive helper rules. ANTLR
keeps repetition and optionality as EBNF nodes. Peggy is scannerless and includes two
unreachable demonstration rules (\`keyword\` and \`other\`) that exercise predicates without
changing the start rule's JSON language. Those source choices explain the different rule,
alternative, depth, and unreachable counts.

Class B metrics require the \`capabilities\` object emitted in features 0.4. Yacc's left
recursion and ANTLR/Peggy repetition describe similar repetition strategies but are not
numerically interchangeable. Peggy ordered choice makes CFG nullability inapplicable. Its
lexicon is represented by literal occurrences, character classes, and \`anyChar\`, while
Yacc and ANTLR have token declarations.

Class C metrics describe format-specific style or heuristics. They should not be compared
numerically even when values happen to match.

The Peggy fixture contains one omitted source action, so its zero-valued legacy action
fields are not complete measurements. Human-readable reporters suppress them using the
explicit action completeness state.

The LLM digest derives interpretation from capabilities rather than format names. Tests
assert the EBNF, lexer-rule, ordered-choice, and scannerless notes. The observed numeric
differences are accounted for by fixture scope or documented capability and representation
rules.
`;

const outputPath = resolve(root, "docs/cross-format-notes.md");
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8");
  if (current !== generated) {
    process.stderr.write("docs/cross-format-notes.md is out of date; run with --update\n");
    process.exitCode = 1;
  }
} else if (process.argv.includes("--update")) {
  await writeFile(outputPath, generated);
} else {
  process.stderr.write("Use --check or --update\n");
  process.exitCode = 3;
}
