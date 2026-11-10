import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("./check-metrics.mjs", import.meta.url));
const catalog = `# Metrics catalog
## Size
| Metric | Definition |
|---|---|
| \`rules\`, \`nonterminals\` | Count definitions, unlike prose \`ignored\`. |
## Parseability
- \`firstSetSize\`, \`followSetSize\`: set cardinalities.
## Error recovery, style, and per-rule records
- \`operations.errorTokenUses\`, \`rulesWithErrorRecovery\`: recovery adoption.
- \`style\`: naming conventions.
- \`perRule\`: rule records.
## Inapplicable metrics
- do not count \`omitted\` in explanations.
`;
const implementation = { file: "packages/analyzer/src/count.ts", symbol: "countFeatures" };
const test = { file: "packages/analyzer/src/count.test.ts", name: "counts the sample" };
const coverage = Object.fromEntries(
  [
    "size.rules",
    "size.nonterminals",
    "parseability.firstSetSize",
    "parseability.followSetSize",
    "operations.errorTokenUses",
    "operations.rulesWithErrorRecovery",
    "style",
    "perRule",
  ].map((metric) => [metric, { implementation, test }]),
);
let directory: string;

const run = () => spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
const writeCoverage = (value: typeof coverage) =>
  writeFile(join(directory, "docs/metrics-coverage.json"), JSON.stringify(value));

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "gramin-metrics-"));
  await mkdir(join(directory, "docs"), { recursive: true });
  await mkdir(join(directory, "packages/analyzer/src"), { recursive: true });
  await Promise.all([
    writeFile(join(directory, "docs/metrics-catalog.md"), catalog),
    writeCoverage(coverage),
    writeFile(join(directory, implementation.file), "export const countFeatures = () => 1;\n"),
    writeFile(join(directory, test.file), 'it("counts the sample", () => {});\n'),
  ]);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("accepts declared metric mappings without treating prose as metrics", () => {
  const result = run();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

it("rejects a catalog metric without a mapping", async () => {
  const { "size.rules": omitted, ...remaining } = coverage;
  expect(omitted).toBeDefined();
  await writeCoverage(remaining);
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Missing metric mapping: size.rules");
});

it("rejects a mapping for a removed metric", async () => {
  await writeCoverage({ ...coverage, "size.removed": { implementation, test } });
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Stale metric mapping: size.removed");
});

it("rejects a metric declaration in an unknown section", async () => {
  await writeFile(
    join(directory, "docs/metrics-catalog.md"),
    `${catalog}\n## New metrics\n- \`newCount\`: a new measurement.\n`,
  );
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Unknown metric section: New metrics");
});

it("rejects a removed or renamed implementation symbol", async () => {
  await writeFile(join(directory, implementation.file), "export const renamed = () => 1;\n");
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "Missing implementation: packages/analyzer/src/count.ts#countFeatures",
  );
});

it("rejects a removed or renamed test", async () => {
  await writeFile(join(directory, test.file), 'it("renamed sample", () => {});\n');
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "Missing active test: packages/analyzer/src/count.test.ts#counts the sample",
  );
});

it("rejects a directly skipped test", async () => {
  await writeFile(join(directory, test.file), 'it.skip("counts the sample", () => {});\n');
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Missing active test:");
});

it("accepts a named parameterized test", async () => {
  await writeFile(join(directory, test.file), 'it.each(samples)("counts the sample", () => {});\n');
  const result = run();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

it("rejects a missing implementation or test file", async () => {
  await rm(join(directory, implementation.file));
  await rm(join(directory, test.file));
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(implementation.file);
  expect(result.stderr).toContain(test.file);
});
