import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = new URL("../", import.meta.url);
const packageRoot = new URL("../packages/", import.meta.url);
const workspacePath = fileURLToPath(workspaceRoot);
const publicPackages = new Set([
  "@gramin/core",
  "@gramin/analyzer",
  "@gramin/frontend-bnf",
  "@gramin/frontend-yacc",
  "@gramin/reporter",
]);

const allowedImports = new Map([
  ["core", new Set()],
  ["analyzer", new Set(["@gramin/core"])],
  ["frontend-bnf", new Set(["@gramin/core"])],
  ["frontend-yacc", new Set(["@gramin/core"])],
  ["reporter", new Set(["@gramin/core"])],
  [
    "cli",
    new Set([
      "@gramin/core",
      "@gramin/analyzer",
      "@gramin/frontend-bnf",
      "@gramin/frontend-yacc",
      "@gramin/reporter",
    ]),
  ],
]);

const collectSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(path);
      return entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return nested.flat();
};

const failures = [];
for (const [packageName, allowed] of allowedImports) {
  const sourceDirectory = new URL(`${packageName}/src/`, packageRoot);
  const files = await collectSourceFiles(fileURLToPath(sourceDirectory));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const imports = source.matchAll(/(?:from\s+|import\s*\()\s*["'](@gramin\/[^"']+)/g);
    for (const match of imports) {
      const specifier = match[1];
      const publicName = specifier?.split("/").slice(0, 2).join("/");
      if (!publicName || !publicPackages.has(publicName)) continue;
      if (specifier !== publicName) {
        failures.push(`${relative(workspacePath, file)}: deep import ${specifier}`);
        continue;
      }
      if (!allowed.has(publicName)) {
        failures.push(`${relative(workspacePath, file)}: forbidden import ${publicName}`);
      }
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}
