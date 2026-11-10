import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSpecForPlatform } from "./release-packages.mjs";
import { stageReleasePackage } from "./stage-release-package.mjs";

let directory: string;
const versions = new Map([["@gramin/core", "1.0.1"]]);
const manifest = {
  name: "@gramin/staging-fixture",
  version: "1.0.1",
  author: "Yudai Takada",
  license: "MIT",
  type: "module",
  files: ["dist", "!dist/**/*.test.*"],
  main: "./dist/index.js",
  bin: { example: "./dist/bin.js" },
  dependencies: { zod: "4.2.0", "@gramin/core": "workspace:*" },
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "gramin-stage-release-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const sourcePackage = async (name: string, content: unknown) => {
  const path = join(directory, name);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "package.json"), `${JSON.stringify(content, null, 2)}\n`);
  return path;
};

const command = (name: string, args: string[]) => {
  const spec = spawnSpecForPlatform(name, args);
  const result = spawnSync(spec.command, spec.args, {
    cwd: directory,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout;
};

describe("release package staging", () => {
  it("resolves and sorts dependency sections while preserving third-party ranges and source bytes", async () => {
    const sections = {
      dependencies: { zod: "4.2.0", "@gramin/core": "workspace:*" },
      optionalDependencies: { z: "^2.0.0", "@gramin/core": "workspace:*" },
      peerDependencies: { z: "~3.0.0", "@gramin/core": "workspace:*" },
      devDependencies: { z: "npm:other@1.0.0", "@gramin/core": "workspace:*" },
    };
    const source = await sourcePackage("source", { ...manifest, ...sections });
    const original = await readFile(join(source, "package.json"), "utf8");
    const staged = join(directory, "staged");
    stageReleasePackage(source, staged, versions);
    const text = await readFile(join(staged, "package.json"), "utf8");
    const prepared = JSON.parse(text);
    for (const [section, dependencies] of Object.entries(sections)) {
      expect(Object.keys(prepared[section])).toEqual(Object.keys(dependencies).sort());
      expect(prepared[section]["@gramin/core"]).toBe("1.0.1");
      const thirdParty = Object.entries(dependencies).find(([name]) => name !== "@gramin/core");
      if (!thirdParty) throw new Error("missing third-party fixture");
      expect(prepared[section][thirdParty[0]]).toBe(thirdParty[1]);
    }
    expect(text).not.toContain("workspace:");
    expect(await readFile(join(source, "package.json"), "utf8")).toBe(original);
  });

  it.each([
    { dependencies: { "@gramin/missing": "workspace:*" } },
    { dependencies: { "@gramin/core": "workspace:^" } },
    { optionalDependencies: { "@gramin/core": "workspace:../core" } },
    { peerDependencies: { "@gramin/core": "workspace:~" } },
    { devDependencies: { "@gramin/core": "workspace:1.0.1" } },
    { dependencies: { zod: 42 } },
    { dependencies: [] },
  ])(
    "rejects unknown workspace references, ranges, and malformed dependencies %j",
    async (changed) => {
      const source = await sourcePackage("source", { ...manifest, ...changed });
      const original = await readFile(join(source, "package.json"), "utf8");
      expect(() => stageReleasePackage(source, join(directory, "staged"), versions)).toThrow();
      expect(await readFile(join(source, "package.json"), "utf8")).toBe(original);
    },
  );

  it("packs equivalent dependency orders into byte-identical tarballs without changing the source", async () => {
    const source = await sourcePackage("source", manifest);
    for (const path of ["dist", "src", "node_modules", ".git"]) {
      await mkdir(join(source, path), { recursive: true });
    }
    await Promise.all([
      writeFile(join(source, "README.md"), "# Staging fixture\n"),
      writeFile(join(source, "LICENSE"), "MIT\n"),
      writeFile(join(source, "dist/index.js"), "export const value = 1;\n"),
      writeFile(join(source, "dist/bin.js"), "#!/usr/bin/env node\nconsole.log(1);\n"),
      writeFile(join(source, "dist/index.test.js"), "must not be published\n"),
      writeFile(join(source, "src/index.ts"), "must not be published\n"),
      writeFile(join(source, "node_modules/private.txt"), "must not be copied\n"),
      writeFile(join(source, ".git/private.txt"), "must not be copied\n"),
    ]);
    await chmod(join(source, "dist/bin.js"), 0o755);
    const firstSource = await readFile(join(source, "package.json"), "utf8");
    const first = join(directory, "first");
    stageReleasePackage(source, first, versions);
    expect(await readFile(join(source, "package.json"), "utf8")).toBe(firstSource);
    const reordered = {
      ...manifest,
      dependencies: { "@gramin/core": "workspace:*", zod: "4.2.0" },
    };
    await writeFile(join(source, "package.json"), `${JSON.stringify(reordered, null, 2)}\n`);
    const secondSource = await readFile(join(source, "package.json"), "utf8");
    const second = join(directory, "second");
    stageReleasePackage(source, second, versions);
    expect(await readFile(join(source, "package.json"), "utf8")).toBe(secondSource);
    for (const stage of [first, second]) {
      await expect(stat(join(stage, "node_modules"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(join(stage, ".git"))).rejects.toMatchObject({ code: "ENOENT" });
      expect((await stat(join(stage, "dist/bin.js"))).mode & 0o777).toBe(
        (await stat(join(source, "dist/bin.js"))).mode & 0o777,
      );
    }
    const archives = [];
    const packedManifests = [];
    for (const [index, stage] of [first, second].entries()) {
      const output = join(directory, `packed-${index}`);
      await mkdir(output);
      command("pnpm", ["--ignore-workspace", "--dir", stage, "pack", "--pack-destination", output]);
      const tarball = join(output, "gramin-staging-fixture-1.0.1.tgz");
      archives.push(await readFile(tarball));
      packedManifests.push(command("tar", ["-xOzf", tarball, "package/package.json"]));
      const entries = command("tar", ["-tzf", tarball])
        .replaceAll("\\", "/")
        .trim()
        .split(/\r?\n/u);
      expect(entries).toEqual(
        expect.arrayContaining([
          "package/package.json",
          "package/README.md",
          "package/LICENSE",
          "package/dist/index.js",
          "package/dist/bin.js",
        ]),
      );
      expect(
        entries.some((path) => path.includes(".test.") || path.startsWith("package/src/")),
      ).toBe(false);
    }
    expect(packedManifests[0]).toBe(packedManifests[1]);
    expect(packedManifests[0]).not.toContain("workspace:");
    expect(archives[0]?.equals(archives[1] ?? Buffer.alloc(0))).toBe(true);
    expect(await readFile(join(source, "package.json"), "utf8")).toBe(secondSource);
  });
});
