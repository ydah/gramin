import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  readJsonObject,
  releaseDirectory,
  releasePackages,
  repositoryRoot,
  tarballName,
  commandForPlatform,
} from "./release-packages.mjs";

const EXPECTED_AUTHOR = "Yudai Takada";
const EXPECTED_LICENSE = "MIT";
const EXPECTED_REPOSITORY = "git+https://github.com/ydah/gramin.git";

const run = (command, args) => {
  const result = spawnSync(commandForPlatform(command), args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result.stdout;
};

const stringField = (object, key, context) => {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }
  return value;
};

const verifyPackedManifest = (manifest, artifact) => {
  const context = `${artifact.name}@${artifact.version}`;
  if (stringField(manifest, "name", context) !== artifact.name) {
    throw new Error(`${context} has an unexpected package name`);
  }
  if (stringField(manifest, "version", context) !== artifact.version) {
    throw new Error(`${context} has an unexpected package version`);
  }
  if (manifest.author !== EXPECTED_AUTHOR || manifest.license !== EXPECTED_LICENSE) {
    throw new Error(`${context} has unexpected author or license metadata`);
  }
  const repository = manifest.repository;
  if (
    typeof repository !== "object" ||
    repository === null ||
    repository.url !== EXPECTED_REPOSITORY
  ) {
    throw new Error(`${context} must identify the canonical GitHub repository`);
  }
  const engines = manifest.engines;
  if (typeof engines !== "object" || engines === null || engines.node !== ">=20") {
    throw new Error(`${context} must require Node.js 20 or newer`);
  }
  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = manifest[section];
    if (typeof dependencies !== "object" || dependencies === null) continue;
    for (const [name, range] of Object.entries(dependencies)) {
      if (typeof range === "string" && range.startsWith("workspace:")) {
        throw new Error(`${context} still has workspace dependency ${name}`);
      }
    }
  }
};

const verifyEntries = (entries, manifest, artifact) => {
  const required = ["package/package.json", "package/README.md", "package/LICENSE"];
  for (const path of required) {
    if (!entries.includes(path)) throw new Error(`${artifact.name} is missing ${path}`);
  }
  const entrypoints = [
    manifest.main,
    manifest.types,
    ...Object.values(typeof manifest.bin === "object" && manifest.bin !== null ? manifest.bin : {}),
  ];
  for (const entrypoint of entrypoints) {
    if (typeof entrypoint !== "string") continue;
    const path = `package/${entrypoint.replace(/^\.\//, "")}`;
    if (!entries.includes(path)) throw new Error(`${artifact.name} is missing ${path}`);
  }
  const forbidden = entries.find(
    (path) =>
      path.startsWith("package/src/") || path.includes(".test.") || path.endsWith(".tsbuildinfo"),
  );
  if (forbidden) throw new Error(`${artifact.name} contains forbidden artifact ${forbidden}`);
};

const allowDirty = process.argv.includes("--allow-dirty");
const status = run("git", ["status", "--porcelain"]).trim();
if (status.length > 0 && !allowDirty) {
  throw new Error("release artifacts must be built from a clean working tree");
}

if (basename(releaseDirectory) !== ".release") {
  throw new Error("refusing to replace an unexpected release directory");
}
rmSync(releaseDirectory, { recursive: true, force: true });
mkdirSync(releaseDirectory, { recursive: true });

const preparedPackages = releasePackages.map(({ name, directory }) => {
  const sourceManifest = readJsonObject(join(repositoryRoot, directory, "package.json"));
  const version = stringField(sourceManifest, "version", `${directory}/package.json`);
  return { name, directory, version };
});
const releaseVersions = new Set(preparedPackages.map(({ version }) => version));
if (releaseVersions.size !== 1) {
  throw new Error("public packages must use one release version");
}

const artifacts = preparedPackages.map(({ name, directory, version }) => {
  run("pnpm", ["--filter", name, "pack", "--pack-destination", releaseDirectory]);
  const file = tarballName(name, version);
  const tarball = join(releaseDirectory, file);
  const entries = run("tar", ["-tzf", tarball]).trim().split("\n").filter(Boolean);
  const packedManifest = JSON.parse(run("tar", ["-xOzf", tarball, "package/package.json"]));
  verifyPackedManifest(packedManifest, { name, version });
  verifyEntries(entries, packedManifest, { name, version });
  const sha512 = createHash("sha512").update(readFileSync(tarball)).digest("hex");
  return { name, version, directory, file, sha512 };
});

const sourceCommit = run("git", ["rev-parse", "HEAD"]).trim();
writeFileSync(
  join(releaseDirectory, "manifest.json"),
  `${JSON.stringify({ sourceCommit, artifacts }, null, 2)}\n`,
);

for (const artifact of artifacts) {
  console.log(`packed ${artifact.name}@${artifact.version} as ${artifact.file}`);
}
