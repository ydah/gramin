import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [readme, packageSource, frontendSource] = await Promise.all([
  readFile("README.md", "utf8"),
  readFile("package.json", "utf8"),
  readFile("packages/core/src/frontend.ts", "utf8"),
]);
const minimumNode = JSON.parse(packageSource).engines.node.match(/^>=(\d+\.\d+\.\d+)$/)?.[1];
assert(minimumNode, "Cannot read the minimum Node.js version from package.json");
const nodeVersions = [...readme.matchAll(/Node\.js\s+([\d.]+) or newer/g)];
assert(
  nodeVersions.length > 0 && nodeVersions.every((match) => match[1] === minimumNode),
  `README Node.js requirements must say ${minimumNode} or newer`,
);

const defaultDepth = frontendSource.match(/export const DEFAULT_MAX_NESTING_DEPTH = (\d+);/)?.[1];
const maximumDepth = frontendSource.match(/export const MAX_SUPPORTED_NESTING_DEPTH = (\d+);/)?.[1];
assert(defaultDepth && maximumDepth, "Cannot read the nesting limits from frontend.ts");
assert.equal(
  readme.match(/Parser nesting defaults to (\d+) levels/)?.[1],
  defaultDepth,
  `README default nesting depth must be ${defaultDepth}`,
);
assert.equal(
  readme.match(/supports a maximum of (\d+)/)?.[1],
  maximumDepth,
  `README maximum nesting depth must be ${maximumDepth}`,
);
