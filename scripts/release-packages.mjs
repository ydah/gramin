import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const releaseDirectory = join(repositoryRoot, ".release");

export const releasePackages = [
  { name: "@gramin/core", directory: "packages/core" },
  { name: "@gramin/analyzer", directory: "packages/analyzer" },
  { name: "@gramin/frontend-antlr", directory: "packages/frontend-antlr" },
  { name: "@gramin/frontend-bnf", directory: "packages/frontend-bnf" },
  { name: "@gramin/frontend-menhir", directory: "packages/frontend-menhir" },
  { name: "@gramin/frontend-peg", directory: "packages/frontend-peg" },
  { name: "@gramin/frontend-yacc", directory: "packages/frontend-yacc" },
  { name: "@gramin/reporter", directory: "packages/reporter" },
  { name: "@gramin/cli", directory: "packages/cli" },
];

export const readJsonObject = (path) => {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON object`);
  }
  return parsed;
};

export const tarballName = (name, version) =>
  `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;

export const commandForPlatform = (command) =>
  process.platform === "win32" && (command === "npm" || command === "pnpm")
    ? `${command}.cmd`
    : command;

export const spawnSpecForPlatform = (command, args) => {
  const platformCommand = commandForPlatform(command);
  if (platformCommand === command) {
    return { command: platformCommand, args };
  }
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", platformCommand, ...args],
  };
};
