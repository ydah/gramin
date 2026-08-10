import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  readJsonObject,
  releaseDirectory,
  releasePackages,
  repositoryRoot,
  spawnSpecForPlatform,
} from "./release-packages.mjs";

const run = (command, args, options = {}) => {
  const spawnSpec = spawnSpecForPlatform(command, args);
  const result = spawnSync(spawnSpec.command, spawnSpec.args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result.stdout;
};

const artifactVersion = (artifacts, name) => {
  const artifact = artifacts.find((candidate) => candidate?.name === name);
  if (typeof artifact?.version !== "string") {
    throw new Error(`release manifest is missing ${name}`);
  }
  return artifact.version;
};

const manifest = readJsonObject(join(releaseDirectory, "manifest.json"));
if (!Array.isArray(manifest.artifacts)) {
  throw new Error("release manifest must contain an artifacts array");
}
if (manifest.artifacts.length !== releasePackages.length) {
  throw new Error("release manifest does not contain every public package");
}

const dependencies = Object.fromEntries(
  manifest.artifacts.map((artifact) => {
    if (
      typeof artifact !== "object" ||
      artifact === null ||
      typeof artifact.name !== "string" ||
      typeof artifact.file !== "string"
    ) {
      throw new Error("release manifest contains an invalid artifact");
    }
    return [artifact.name, pathToFileURL(join(releaseDirectory, artifact.file)).href];
  }),
);

const smokeDirectory = mkdtempSync(join(tmpdir(), "gramin-release-smoke-"));
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(smokeDirectory, ".npm-cache"),
};
delete npmEnvironment.NODE_TLS_REJECT_UNAUTHORIZED;

try {
  writeFileSync(
    join(smokeDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "gramin-release-smoke",
        private: true,
        type: "module",
        dependencies,
      },
      null,
      2,
    )}\n`,
  );
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], {
    cwd: smokeDirectory,
    env: npmEnvironment,
    stdio: "inherit",
  });

  const cli = join(smokeDirectory, "node_modules", "@gramin", "cli", "dist", "bin.js");
  const version = run("node", [cli, "--version"], { cwd: smokeDirectory }).trim();
  if (version !== artifactVersion(manifest.artifacts, "@gramin/cli")) {
    throw new Error(`installed CLI reported unexpected version ${version}`);
  }
  const help = run("node", [cli, "--help"], { cwd: smokeDirectory });
  if (!help.includes("gramin analyze")) throw new Error("installed CLI help is incomplete");

  const fixture = join(repositoryRoot, "packages", "frontend-yacc", "fixtures", "calc.y");
  const output = run("node", [cli, "analyze", fixture, "--format", "json", "--strip-loc"], {
    cwd: smokeDirectory,
  });
  const features = JSON.parse(output);
  if (
    typeof features !== "object" ||
    features === null ||
    features.source?.format !== "yacc" ||
    features.size?.rules !== 2
  ) {
    throw new Error("installed CLI returned unexpected analysis output");
  }

  const apiSmoke = `
import { analyzeGrammar } from "@gramin/analyzer";
import { IR_VERSION, validateIR } from "@gramin/core";
import { antlrFrontend } from "@gramin/frontend-antlr";
import { bnfFrontend } from "@gramin/frontend-bnf";
import { menhirFrontend } from "@gramin/frontend-menhir";
import { pegFrontend } from "@gramin/frontend-peg";
import { yaccFrontend } from "@gramin/frontend-yacc";
import { renderJson } from "@gramin/reporter";
import { CLI_VERSION } from "@gramin/cli";

const functions = [analyzeGrammar, validateIR, renderJson];
if (functions.some((value) => typeof value !== "function")) {
  throw new Error("a public package export is missing");
}
const frontends = [
  antlrFrontend,
  bnfFrontend,
  menhirFrontend,
  pegFrontend,
  yaccFrontend,
];
if (frontends.some((frontend) => typeof frontend?.parse !== "function")) {
  throw new Error("a public frontend export is missing");
}
if (IR_VERSION !== "1.2.0" || CLI_VERSION !== "0.1.0") {
  throw new Error("an installed public version constant is incorrect");
}
`;
  writeFileSync(join(smokeDirectory, "smoke.mjs"), apiSmoke);
  run("node", ["smoke.mjs"], { cwd: smokeDirectory });
} finally {
  rmSync(smokeDirectory, { recursive: true, force: true });
}

console.log("release tarball smoke test passed");
