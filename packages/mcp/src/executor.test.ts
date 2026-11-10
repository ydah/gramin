import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runIsolated } from "./executor.js";

describe("MCP resource isolation", () => {
  it("supports an embedding host launched with eval-only Node flags", async () => {
    const moduleUrl = new URL("../dist/executor.js", import.meta.url).href;
    const script = `import {runIsolated} from ${JSON.stringify(moduleUrl)}; console.log(await runIsolated("analyze", {frontend:"bnf",files:[{name:"sample.bnf",content:'s ::= "x";'}]}));`;
    await expect(
      promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], {
        timeout: 3000,
      }),
    ).resolves.toMatchObject({ stdout: expect.stringContaining('"rules": 1') });
  });

  it("stops external-buffer growth independently of the worker heap limit", async () => {
    await expect(
      runIsolated(
        "analyze",
        {},
        {
          rssLimitBytes: 4 * 1024 * 1024,
          workerUrl: new URL(
            "data:text/javascript,globalThis.kept=new Uint8Array(64*1024*1024).fill(1);setInterval(()=>{},1000)",
          ),
        },
      ),
    ).rejects.toThrow(/memory/);
  });

  it("terminates a worker that does not finish before its deadline", async () => {
    await expect(
      runIsolated(
        "analyze",
        {},
        {
          timeoutMs: 5,
          workerUrl: new URL("data:text/javascript,while(true){}"),
        },
      ),
    ).rejects.toThrow(/deadline/);
  });

  it("reports a worker failure without exposing its stack or input", async () => {
    await expect(
      runIsolated(
        "analyze",
        {},
        {
          workerUrl: new URL("data:text/javascript,throw new Error('private-test-content')"),
        },
      ),
    ).rejects.toThrow("grammar worker failed");
  });

  it("rejects oversized messages before starting an isolated worker", async () => {
    await expect(
      runIsolated("analyze", { files: [{ name: "large", content: "x".repeat(3 * 1024 * 1024) }] }),
    ).rejects.toThrow(/byte/);
  });
});
