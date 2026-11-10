import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readJsonObject } from "./release-packages.mjs";

export const stageReleasePackage = (sourceDirectory, stagingDirectory, packageVersions) => {
  const manifest = readJsonObject(join(sourceDirectory, "package.json"));
  for (const section of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const dependencies = manifest[section];
    if (dependencies === undefined) continue;
    if (typeof dependencies !== "object" || dependencies === null || Array.isArray(dependencies))
      throw new Error(`invalid ${section} in ${manifest.name}`);
    manifest[section] = Object.fromEntries(
      Object.keys(dependencies)
        .sort()
        .map((name) => {
          const range = dependencies[name];
          if (typeof range !== "string") throw new Error(`invalid dependency range for ${name}`);
          if (!range.startsWith("workspace:")) return [name, range];
          if (range !== "workspace:*")
            throw new Error(`unsupported workspace range for ${name}: ${range}`);
          const version = packageVersions.get(name);
          if (typeof version !== "string" || version.length === 0)
            throw new Error(`unknown release workspace dependency ${name}`);
          return [name, version];
        }),
    );
  }
  mkdirSync(stagingDirectory, { recursive: true });
  cpSync(sourceDirectory, stagingDirectory, {
    recursive: true,
    filter: (path) => !["node_modules", ".git"].includes(basename(path)),
  });
  writeFileSync(join(stagingDirectory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
};
