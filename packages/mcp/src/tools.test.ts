import { describe, expect, it } from "vitest";
import { executeTool, MCP_LIMITS, TOOL_DEFINITIONS } from "./tools.js";

const input = { frontend: "bnf", files: [{ name: "sample.bnf", content: 's ::= "x";' }] };

describe("MCP grammar tools", () => {
  it("advertises only the four read-only grammar tools", () => {
    expect(TOOL_DEFINITIONS.map(({ name }) => name)).toEqual(["analyze", "diff", "ir", "digest"]);
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("returns features, IR, comparisons and bounded digests through the public contracts", () => {
    const features = JSON.parse(executeTool("analyze", input));
    expect(features.size.rules).toBe(1);
    const ir = JSON.parse(executeTool("ir", input));
    expect(ir.rules[0].name).toBe("s");
    expect(JSON.parse(executeTool("diff", { before: features, after: features })).changes).toEqual(
      [],
    );
    const digest = executeTool("digest", { features, budgetChars: 2500 });
    expect(digest).toContain("untrusted grammar-derived data");
    expect(digest.length).toBeLessThanOrEqual(2500);
  });

  it("can opt into raw LR analysis while keeping source actions opaque", () => {
    const source = {
      frontend: "yacc-family",
      files: [{ name: "opaque.y", content: "%%\ns: 'x' { process.exit(42); };" }],
      analysis: "lr",
    };
    const features = JSON.parse(executeTool("analyze", source));
    expect(features.parseability.slr.states).toBe(3);
    expect(features.actions.totalActions).toBe(1);
    expect(executeTool("ir", { frontend: source.frontend, files: source.files })).not.toContain(
      "process.exit",
    );
  });

  it.each([
    ["analyze", { ...input, frontend: "external", command: "sh" }],
    ["analyze", { ...input, frontendCommand: "sh" }],
    ["analyze", { ...input, files: [{ name: "sample.bnf" }] }],
    ["analyze", { ...input, files: [] }],
    ["analyze", { ...input, analysis: "lalr" }],
    ["analyze", { ...input, maxNestingDepth: 257 }],
    ["ir", { ...input, analysis: "lr" }],
    ["diff", { before: {}, after: {} }],
    ["digest", { features: {}, budgetChars: 2500 }],
    ["digest", { features: {}, budgetChars: -1 }],
    ["run", { command: "sh" }],
  ])("rejects invalid %s input", (name, value) => {
    expect(() => executeTool(name, value)).toThrow();
  });

  it("bounds file counts, total UTF-8 bytes and object depth before measurement", () => {
    expect(() =>
      executeTool("analyze", {
        ...input,
        files: Array.from({ length: MCP_LIMITS.files + 1 }, () => input.files[0]),
      }),
    ).toThrow(/file/i);
    expect(() =>
      executeTool("analyze", {
        ...input,
        files: [{ name: "large.bnf", content: "語".repeat(MCP_LIMITS.inputBytes) }],
      }),
    ).toThrow(/byte/i);
    let deep: unknown = {};
    for (let i = 0; i < 100; i += 1) deep = { nested: deep };
    expect(() => executeTool("diff", { before: deep, after: deep })).toThrow(/depth/i);
  });

  it("rejects invalid grammar output and repeated logical filenames", () => {
    expect(() => executeTool("ir", { ...input, files: [...input.files, ...input.files] })).toThrow(
      /name/i,
    );
    expect(() =>
      executeTool("analyze", {
        ...input,
        files: [{ name: "broken.bnf", content: "this is not a grammar" }],
      }),
    ).toThrow();
  });
});
