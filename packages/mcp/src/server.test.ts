import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("MCP stdio server", () => {
  it("negotiates MCP, lists four tools and measures text without stdout noise", async () => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../dist/bin.js", import.meta.url))],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const pending = new Map<
      number,
      { resolve: (value: unknown) => void; reject: (reason: Error) => void }
    >();
    const lines = createInterface({ input: child.stdout });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    lines.on("line", (line) => {
      try {
        const message: unknown = JSON.parse(line);
        if (
          message !== null &&
          typeof message === "object" &&
          "id" in message &&
          typeof message.id === "number"
        )
          pending.get(message.id)?.resolve(message);
      } catch {
        for (const { reject } of pending.values()) reject(new Error("non-protocol stdout"));
      }
    });
    child.on("exit", () => {
      for (const { reject } of pending.values()) reject(new Error(`server exited: ${stderr}`));
    });
    let nextId = 0;
    const request = async (method: string, params: unknown): Promise<unknown> => {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("MCP response timeout")), 3000);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            pending.delete(id);
            resolve(value);
          },
          reject: (reason) => {
            clearTimeout(timer);
            pending.delete(id);
            reject(reason);
          },
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    };
    try {
      expect(
        await request("initialize", {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "gramin-test", version: "1.0.0" },
        }),
      ).toMatchObject({ result: { serverInfo: { name: "@gramin/mcp" } } });
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
      );
      expect(await request("tools/list", {})).toMatchObject({
        result: {
          tools: [{ name: "analyze" }, { name: "diff" }, { name: "ir" }, { name: "digest" }],
        },
      });
      expect(
        await request("tools/call", {
          name: "analyze",
          arguments: { frontend: "bnf", files: [{ name: "sample.bnf", content: 's ::= "x";' }] },
        }),
      ).toMatchObject({
        result: { content: [{ type: "text", text: expect.stringContaining('"rules": 1') }] },
      });
      expect(
        await request("tools/call", {
          name: "analyze",
          arguments: { frontendCommand: "sh", files: [] },
        }),
      ).toMatchObject({ result: { isError: true } });
      expect(stderr).toBe("");
    } finally {
      lines.close();
      child.stdin.end();
      child.kill();
    }
  });
});
