import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  readJsonObject,
  releaseDirectory,
  releasePackages,
  repositoryRoot,
  spawnSpecForPlatform,
} from "./release-packages.mjs";
import { assertPublishedArtifact, waitForPublishedArtifact } from "./verify-published.mjs";

const run = (command, args) => {
  const spawnSpec = spawnSpecForPlatform(command, args);
  const result = spawnSync(spawnSpec.command, spawnSpec.args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result;
};

const requiredArgument = (name) => {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} requires a value`);
  }
  return value;
};

const tag = requiredArgument("--tag");
if (!/^[a-z][a-z0-9._-]*$/.test(tag)) {
  throw new Error(`invalid npm distribution tag ${tag}`);
}
const planOnly = process.argv.includes("--plan");
if (!planOnly && process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("publishing is restricted to the protected GitHub Actions workflow");
}
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  throw new Error("refusing to publish while TLS certificate verification is disabled");
}

const status = run("git", ["status", "--porcelain"]);
if (status.status !== 0 || status.stdout.trim().length > 0) {
  throw new Error("publishing requires a clean working tree");
}
const head = run("git", ["rev-parse", "HEAD"]);
if (head.status !== 0) throw new Error("unable to resolve the source commit");

const manifest = readJsonObject(join(releaseDirectory, "manifest.json"));
if (manifest.sourceCommit !== head.stdout.trim() || !Array.isArray(manifest.artifacts)) {
  throw new Error("release manifest does not match the checked-out commit");
}
if (manifest.artifacts.length !== releasePackages.length) {
  throw new Error("release manifest does not contain every public package");
}

const acceptedPublications = [];
for (const [index, expected] of releasePackages.entries()) {
  const artifact = manifest.artifacts[index];
  if (
    typeof artifact !== "object" ||
    artifact === null ||
    artifact.name !== expected.name ||
    artifact.directory !== expected.directory ||
    typeof artifact.version !== "string" ||
    typeof artifact.file !== "string" ||
    typeof artifact.sha512 !== "string"
  ) {
    throw new Error(`release manifest has an invalid artifact at index ${index}`);
  }
  const tarball = join(releaseDirectory, artifact.file);
  const actualHash = createHash("sha512").update(readFileSync(tarball)).digest("hex");
  if (actualHash !== artifact.sha512) {
    throw new Error(`${artifact.file} does not match its recorded SHA-512 digest`);
  }
  if (planOnly) {
    console.log(`would publish ${artifact.name}@${artifact.version} with tag ${tag}`);
    continue;
  }

  const query = () =>
    run("npm", [
      "view",
      `${artifact.name}@${artifact.version}`,
      "--json",
      "--prefer-online",
      "--registry=https://registry.npmjs.org",
      "--fetch-retries=0",
      "--fetch-timeout=10000",
    ]);
  const existing = query();
  if (existing.status === 0) {
    assertPublishedArtifact(artifact, existing.stdout);
    console.log(`skipping existing ${artifact.name}@${artifact.version}`);
    continue;
  }
  if (existing.status === null || !/\bE404\b/u.test(existing.stderr ?? "")) {
    throw new Error(
      `could not query ${artifact.name}@${artifact.version} in the public npm registry`,
    );
  }
  const published = run("npm", [
    "publish",
    tarball,
    "--access",
    "public",
    "--tag",
    tag,
    "--provenance",
    "--registry=https://registry.npmjs.org",
  ]);
  if (published.status !== 0) {
    throw new Error(
      `failed to publish ${artifact.name}@${artifact.version}\n${published.stdout ?? ""}${
        published.stderr ?? ""
      }`,
    );
  }
  acceptedPublications.push({ artifact, query });
}

for (const { artifact, query } of acceptedPublications) {
  await waitForPublishedArtifact(artifact, query);
  console.log(`published ${artifact.name}@${artifact.version} with tag ${tag}`);
}
