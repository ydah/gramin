import { describe, expect, it } from "vitest";
import { runExternalFrontendProcess } from "./external-frontend.js";

describe("external frontend process limits", () => {
  it("terminates a frontend that exceeds its timeout", async () => {
    await expect(
      runExternalFrontendProcess(
        process.execPath,
        ["-e", "setTimeout(() => {}, 1000)"],
        undefined,
        {
          timeoutMs: 20,
        },
      ),
    ).rejects.toMatchObject({
      code: "FRONTEND_TIMEOUT",
    });
  });

  it("terminates a frontend that exceeds the output limit", async () => {
    await expect(
      runExternalFrontendProcess(
        process.execPath,
        ["-e", "process.stdout.write('x'.repeat(128))"],
        undefined,
        {
          maxOutputBytes: 32,
        },
      ),
    ).rejects.toMatchObject({
      code: "FRONTEND_OUTPUT_TOO_LARGE",
    });
  });
});
