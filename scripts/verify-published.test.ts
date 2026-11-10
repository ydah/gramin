import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { assertPublishedArtifact, waitForPublishedArtifact } from "./verify-published.mjs";

const artifact = {
  name: "@gramin/example",
  version: "0.4.0",
  sha512: createHash("sha512").update("verified tarball").digest("hex"),
};
const metadata = {
  name: artifact.name,
  version: artifact.version,
  dist: { integrity: `sha512-${Buffer.from(artifact.sha512, "hex").toString("base64")}` },
};
const visible = { status: 0, stdout: JSON.stringify(metadata), stderr: "" };
const missing = { status: 1, stdout: "", stderr: "npm error code E404" };

describe("published artifact verification", () => {
  it("accepts only the exact public package version and tarball integrity", () => {
    expect(() => assertPublishedArtifact(artifact, visible.stdout)).not.toThrow();
  });

  it.each([
    { ...metadata, name: "@other/example" },
    { ...metadata, version: "0.3.0" },
    { ...metadata, dist: { integrity: "sha512-different" } },
    { ...metadata, dist: {} },
    null,
    [],
  ])("rejects mismatched or incomplete registry metadata %j", (document) => {
    expect(() => assertPublishedArtifact(artifact, JSON.stringify(document))).toThrow(
      /does not match the verified tarball/u,
    );
  });

  it("rejects invalid metadata without printing its content", () => {
    expect(() => assertPublishedArtifact(artifact, "private-token-content")).toThrow(
      /^invalid registry metadata for @gramin\/example@0\.4\.0$/u,
    );
  });

  it("retries propagation E404 until matching public metadata is visible", async () => {
    const query = vi.fn().mockResolvedValueOnce(missing).mockResolvedValueOnce(visible);
    const pause = vi.fn().mockResolvedValue(undefined);
    await expect(waitForPublishedArtifact(artifact, query, pause)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("stops after twelve missing-version responses with a retry instruction", async () => {
    const query = vi.fn().mockResolvedValue(missing);
    const pause = vi.fn().mockResolvedValue(undefined);
    await expect(waitForPublishedArtifact(artifact, query, pause)).rejects.toThrow(
      /publication is not visible.*retry the release workflow/u,
    );
    expect(query).toHaveBeenCalledTimes(12);
    expect(pause).toHaveBeenCalledTimes(11);
  });

  it.each([
    { status: 1, stdout: "", stderr: "E401 secret-authentication-detail" },
    { status: 1, stdout: "", stderr: "ENOTFOUND private-network-detail" },
    { status: null, stdout: "", stderr: "E404", error: new Error("private-process-detail") },
    { status: null, stdout: "", stderr: "E404" },
  ])("fails immediately on a registry/process failure without exposing stderr", async (result) => {
    const query = vi.fn().mockResolvedValue(result);
    const pause = vi.fn();
    await expect(waitForPublishedArtifact(artifact, query, pause)).rejects.toEqual(
      new Error("registry lookup failed for @gramin/example@0.4.0"),
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it("fails immediately when an existing version has different contents", async () => {
    const query = vi.fn().mockResolvedValue({
      ...visible,
      stdout: JSON.stringify({ ...metadata, dist: { integrity: "sha512-replaced" } }),
    });
    const pause = vi.fn();
    await expect(waitForPublishedArtifact(artifact, query, pause)).rejects.toThrow(
      /does not match the verified tarball/u,
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });
});
