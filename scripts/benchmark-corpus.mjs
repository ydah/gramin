import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { analyzeGrammar } from "../packages/analyzer/dist/index.js";
import { antlrFrontend } from "../packages/frontend-antlr/dist/index.js";
import { yaccFrontend } from "../packages/frontend-yacc/dist/index.js";

const baseline = JSON.parse(await readFile("fixtures/perf-baseline.json", "utf8"));
const cases = [
  {
    key: "ruby/parse.y",
    frontend: yaccFrontend,
    options: { dialect: "lrama" },
    files: ["fixtures/downloaded/ruby/parse.y"],
  },
  {
    key: "antlr/json/JSON.g4",
    frontend: antlrFrontend,
    options: {},
    files: ["fixtures/downloaded/antlr/json/JSON.g4"],
  },
  {
    key: "antlr/sqlite/SQLiteParser.g4+SQLiteLexer.g4",
    frontend: antlrFrontend,
    options: {},
    files: [
      "fixtures/downloaded/antlr/sqlite/SQLiteParser.g4",
      "fixtures/downloaded/antlr/sqlite/SQLiteLexer.g4",
    ],
  },
  {
    key: "antlr/java/JavaParser.g4+JavaLexer.g4",
    frontend: antlrFrontend,
    options: {},
    files: [
      "fixtures/downloaded/antlr/java/JavaParser.g4",
      "fixtures/downloaded/antlr/java/JavaLexer.g4",
    ],
  },
];

const results = [];
for (const benchmark of cases) {
  const files = await Promise.all(
    benchmark.files.map(async (fileName) => ({
      name: fileName,
      content: await readFile(fileName, "utf8"),
    })),
  );
  const startedAt = performance.now();
  const parsed = benchmark.frontend.parse(files, benchmark.options);
  if (!parsed.ir) throw new Error(`${benchmark.key} did not produce Grammar IR`);
  const features = analyzeGrammar(parsed.ir);
  const elapsedMilliseconds = performance.now() - startedAt;
  const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const result = {
    key: benchmark.key,
    elapsedMilliseconds: Math.round(elapsedMilliseconds * 100) / 100,
    limitMilliseconds: baseline[benchmark.key],
    rules: parsed.ir.rules.length,
    terminals: parsed.ir.terminals.length,
    errors: errors.length,
    unresolvedSymbols: features.size.unresolvedSymbols,
  };
  results.push(result);
  if (
    result.limitMilliseconds === undefined ||
    result.elapsedMilliseconds > result.limitMilliseconds ||
    result.errors > 0 ||
    result.unresolvedSymbols.count > 0
  ) {
    process.exitCode = 1;
  }
}

process.stdout.write(`${JSON.stringify({ cases: results }, null, 2)}\n`);
