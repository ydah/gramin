import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [catalog, coverageSource] = await Promise.all([
  readFile("docs/metrics-catalog.md", "utf8"),
  readFile("docs/metrics-coverage.json", "utf8"),
]);
const coverage = JSON.parse(coverageSource);
const sections = {
  Size: "size",
  Structure: "structure",
  Precedence: "precedence",
  Lexicon: "lexicon",
  "Sugar and extensions": "sugar",
  Actions: "actions",
  Parseability: "parseability",
  "Redundancy and refactoring candidates": "redundancy",
  "Advanced structure": "structure",
  "PEG and ordered choice": "peg",
  "Lexical usage": "lexicon",
  "Error recovery, style, and per-rule records": "",
};
const roots = new Set([...Object.values(sections), "operations", "style", "perRule"]);
const metrics = new Set();
let section;
let headingName;
for (const line of catalog.split(/\r?\n/u)) {
  const heading = line.match(/^## (.+)$/u);
  if (heading) {
    headingName = heading[1];
    section = sections[headingName];
  }
  const declaration =
    line.match(/^\|\s*((?:`[^`]+`(?:,\s*)?)+)\s*\|/u)?.[1] ??
    line.match(/^-\s+((?:`[^`]+`(?:,\s*)?)+)\s*:/u)?.[1];
  if (!declaration) continue;
  assert(section !== undefined, `Unknown metric section: ${headingName}`);
  let prefix = section;
  for (const [, name] of declaration.matchAll(/`([^`]+)`/gu)) {
    const root = name.split(".")[0];
    if (roots.has(root)) {
      metrics.add(name);
      if (section === "") prefix = root;
      continue;
    }
    assert(prefix, `Metric declaration needs a section prefix: ${name}`);
    metrics.add(`${prefix}.${name}`);
  }
}
assert(metrics.size > 0, "No metric declarations found in docs/metrics-catalog.md");

const errors = [];
for (const metric of metrics) {
  if (!Object.hasOwn(coverage, metric)) errors.push(`Missing metric mapping: ${metric}`);
}
for (const metric of Object.keys(coverage)) {
  if (!metrics.has(metric)) errors.push(`Stale metric mapping: ${metric}`);
}

const sources = new Map();
const source = (file) => {
  if (!sources.has(file)) {
    sources.set(
      file,
      readFile(file, "utf8").catch((error) => {
        if (error.code === "ENOENT") return "";
        throw error;
      }),
    );
  }
  return sources.get(file);
};
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
for (const [metric, { implementation, test }] of Object.entries(coverage)) {
  assert(
    implementation?.file && implementation.symbol && test?.file && test.name,
    `Invalid metric mapping: ${metric}`,
  );
  const implementationPattern = new RegExp(
    `^(?:export\\s+)?(?:const|function|class)\\s+${escapePattern(implementation.symbol)}\\b`,
    "mu",
  );
  if (!implementationPattern.test(await source(implementation.file))) {
    errors.push(
      `Missing implementation: ${implementation.file}#${implementation.symbol} (${metric})`,
    );
  }
  const testPattern = new RegExp(
    `^\\s*(?:it|test)(?:\\.each\\([^)]*\\))?\\(\\s*["'\x60]${escapePattern(test.name)}["'\x60]\\s*,`,
    "mu",
  );
  if (!testPattern.test(await source(test.file))) {
    errors.push(`Missing active test: ${test.file}#${test.name} (${metric})`);
  }
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
