import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const events: string[] = [];
  const accepted = new Set<string>();
  const metadata = new Map<string, unknown>();
  return {
    events,
    accepted,
    metadata,
    failedPublish: "",
    spawn: vi.fn(),
    artifacts: ["first", "second"].map((name) => ({
      name: `@gramin/${name}`,
      version: "1.0.0",
      directory: `packages/${name}`,
      file: `gramin-${name}-1.0.0.tgz`,
      sha512: "",
    })),
  };
});

vi.mock("node:child_process", () => ({ spawnSync: state.spawn }));
vi.mock("node:fs", () => ({ readFileSync: () => Buffer.from("verified tarball") }));
vi.mock("./release-packages.mjs", () => ({
  releaseDirectory: "/release",
  repositoryRoot: "/repository",
  releasePackages: state.artifacts.map(({ name, directory }) => ({ name, directory })),
  readJsonObject: () => ({ sourceCommit: "source-commit", artifacts: state.artifacts }),
  spawnSpecForPlatform: (command: string, args: string[]) => ({ command, args }),
}));

const originalArgv = process.argv;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("GITHUB_ACTIONS", "true");
  vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "1");
  process.argv = [process.execPath, "publish-release.mjs", "--tag", "latest"];
  state.events.length = 0;
  state.accepted.clear();
  state.metadata.clear();
  state.failedPublish = "";
  for (const artifact of state.artifacts) {
    artifact.sha512 = createHash("sha512").update("verified tarball").digest("hex");
    state.metadata.set(artifact.name, {
      name: artifact.name,
      version: artifact.version,
      dist: { integrity: `sha512-${Buffer.from(artifact.sha512, "hex").toString("base64")}` },
    });
  }
  vi.spyOn(console, "log").mockImplementation((message: string) => {
    state.events.push(message);
  });
  state.spawn.mockReset().mockImplementation((command: string, args: string[]) => {
    const ok = { status: 0, stdout: "", stderr: "" };
    if (command === "git") {
      return { ...ok, stdout: args[0] === "rev-parse" ? "source-commit\n" : "" };
    }
    if (command === "npm" && args[0] === "view") {
      const artifact = state.artifacts.find(
        ({ name, version }) => `${name}@${version}` === args[1],
      );
      if (!artifact) throw new Error("unexpected registry query");
      if (!state.accepted.has(artifact.name)) {
        return { status: 1, stdout: "", stderr: "E404" };
      }
      state.events.push(`verify ${artifact.name}`);
      return { ...ok, stdout: JSON.stringify(state.metadata.get(artifact.name)) };
    }
    if (command === "npm" && args[0] === "publish") {
      const artifact = state.artifacts.find(({ file }) => args[1]?.endsWith(file));
      if (!artifact) throw new Error("unexpected tarball");
      if (artifact.name === state.failedPublish) {
        return { status: 1, stdout: "", stderr: "publishing rejected" };
      }
      state.accepted.add(artifact.name);
      state.events.push(`accepted ${artifact.name}`);
      return ok;
    }
    throw new Error("unexpected release command");
  });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("release publication order", () => {
  it("accepts all publish requests in order before waiting for public visibility", async () => {
    await import("./publish-release.mjs");
    expect(state.events).toEqual([
      "accepted @gramin/first",
      "accepted @gramin/second",
      "verify @gramin/first",
      "published @gramin/first@1.0.0 with tag latest",
      "verify @gramin/second",
      "published @gramin/second@1.0.0 with tag latest",
    ]);
  });

  it("does not claim success for an accepted publication with mismatched public contents", async () => {
    state.metadata.set("@gramin/second", {
      name: "@gramin/second",
      version: "1.0.0",
      dist: { integrity: "sha512-different" },
    });
    await expect(import("./publish-release.mjs")).rejects.toThrow(/verified tarball/u);
    expect(state.events).toContain("accepted @gramin/second");
    expect(state.events).not.toContain("published @gramin/second@1.0.0 with tag latest");
  });

  it.each(["@gramin/first", "@gramin/second"])(
    "stops immediately when publishing %s fails",
    async (name) => {
      state.failedPublish = name;
      await expect(import("./publish-release.mjs")).rejects.toThrow(/failed to publish/u);
      expect(state.events).toEqual(name === "@gramin/first" ? [] : ["accepted @gramin/first"]);
    },
  );

  it("validates an existing version before skipping its publish request", async () => {
    state.accepted.add("@gramin/first");
    await import("./publish-release.mjs");
    expect(state.events).toEqual([
      "verify @gramin/first",
      "skipping existing @gramin/first@1.0.0",
      "accepted @gramin/second",
      "verify @gramin/second",
      "published @gramin/second@1.0.0 with tag latest",
    ]);
  });

  it("fails before any publishing if an existing version has mismatched contents", async () => {
    state.accepted.add("@gramin/first");
    state.metadata.set("@gramin/first", {
      name: "@gramin/first",
      version: "1.0.0",
      dist: { integrity: "sha512-different" },
    });
    await expect(import("./publish-release.mjs")).rejects.toThrow(/verified tarball/u);
    expect(state.events).toEqual(["verify @gramin/first"]);
  });
});
