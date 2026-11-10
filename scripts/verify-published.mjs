import { setTimeout } from "node:timers/promises";

export const assertPublishedArtifact = (artifact, text) => {
  const identity = `${artifact.name}@${artifact.version}`;
  let metadata;
  try {
    metadata = JSON.parse(text);
  } catch {
    throw new Error(`invalid registry metadata for ${identity}`);
  }
  const integrity = `sha512-${Buffer.from(artifact.sha512, "hex").toString("base64")}`;
  if (
    metadata?.name !== artifact.name ||
    metadata?.version !== artifact.version ||
    metadata?.dist?.integrity !== integrity
  ) {
    throw new Error(`registry metadata for ${identity} does not match the verified tarball`);
  }
};

export const waitForPublishedArtifact = async (
  artifact,
  query,
  pause = () => setTimeout(15_000),
) => {
  const identity = `${artifact.name}@${artifact.version}`;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await query();
    if (result.error || typeof result.status !== "number")
      throw new Error(`registry lookup failed for ${identity}`);
    if (result.status === 0) {
      assertPublishedArtifact(artifact, result.stdout);
      return;
    }
    if (!/\bE404\b/u.test(result.stderr ?? ""))
      throw new Error(`registry lookup failed for ${identity}`);
    if (attempt < 11) await pause();
  }
  throw new Error(
    `publication is not visible in the public npm registry for ${identity}; retry the release workflow after registry propagation`,
  );
};
