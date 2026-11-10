import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("./check-readme.mjs", import.meta.url));
const readme = `Requires Node.js 22.12.0 or newer.
Parser nesting defaults to 256 levels and supports a maximum of 256.
`;
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "gramin-readme-"));
  await mkdir(join(directory, "packages/core/src"), { recursive: true });
  await Promise.all([
    writeFile(join(directory, "README.md"), readme),
    writeFile(join(directory, "package.json"), JSON.stringify({ engines: { node: ">=22.12.0" } })),
    writeFile(
      join(directory, "packages/core/src/frontend.ts"),
      "export const DEFAULT_MAX_NESTING_DEPTH = 256;\nexport const MAX_SUPPORTED_NESTING_DEPTH = 256;\n",
    ),
  ]);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("accepts README requirements matching package engines and source limits", () => {
  const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

it.each([
  ["Node.js 22.12.0", "Node.js 20.0.0", "README Node.js"],
  ["defaults to 256", "defaults to 500", "README default nesting"],
  ["maximum of 256", "maximum of 1000", "README maximum nesting"],
  ["Requires Node.js 22.12.0 or newer.", "", "README Node.js"],
  [
    "Parser nesting defaults to 256 levels and supports a maximum of 256.",
    "",
    "README default nesting",
  ],
])("rejects stale or missing %s documentation", async (before, after, message) => {
  await writeFile(join(directory, "README.md"), readme.replace(before, after));
  const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(message);
});

it("checks every documented Node.js requirement", async () => {
  await writeFile(
    join(directory, "README.md"),
    `${readme}\nDevelopment requires Node.js 20.0.0 or newer.`,
  );
  const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("README Node.js");
});
