import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { analyzeGrammar } from "../packages/analyzer/dist/index.js";
import { yaccFrontend } from "../packages/frontend-yacc/dist/index.js";

const fileName = "fixtures/downloaded/ruby/parse.y";
const content = await readFile(fileName, "utf8");
const startedAt = performance.now();
const parsed = yaccFrontend.parse([{ name: fileName, content }], { dialect: "lrama" });
if (!parsed.ir) throw new Error("Ruby parse.y did not produce Grammar IR");
const features = analyzeGrammar(parsed.ir);
const elapsedMilliseconds = performance.now() - startedAt;
const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");

const summary = {
  elapsedMilliseconds: Math.round(elapsedMilliseconds * 100) / 100,
  rules: parsed.ir.rules.length,
  terminals: parsed.ir.terminals.length,
  errors: errors.length,
  unresolvedSymbols: features.size.unresolvedSymbols,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (errors.length > 0 || features.size.unresolvedSymbols.count > 0) process.exitCode = 1;
if (elapsedMilliseconds > 3_000) process.exitCode = 1;
