import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CliIO } from "./cli.js";
import { EXIT_FATAL, EXIT_SUCCESS, EXIT_USAGE, runCli } from "./cli.js";

const calc = readFileSync(new URL("../../frontend-yacc/fixtures/calc.y", import.meta.url), "utf8");

const harness = (files: Readonly<Record<string, string>> = { "calc.y": calc }) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const written = new Map<string, string>();
  let stdin = "";
  const io: CliIO = {
    readTextFile: async (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`missing test file ${path}`);
      return content;
    },
    readStdin: async () => stdin,
    writeTextFile: async (path, content) => {
      written.set(path, content);
    },
    writeOut: (text) => stdout.push(text),
    writeError: (text) => stderr.push(text),
  };
  return {
    io,
    stdout,
    stderr,
    written,
    setStdin: (value: string) => {
      stdin = value;
    },
  };
};

describe("gramin CLI", () => {
  it("runs grammar to IR to features as a byte-identical pipeline", async () => {
    const irRun = harness();
    expect(await runCli(["ir", "calc.y", "--strip-loc"], irRun.io)).toBe(EXIT_SUCCESS);

    const piped = harness();
    piped.setStdin(irRun.stdout.join(""));
    expect(await runCli(["analyze", "--ir", "-"], piped.io)).toBe(EXIT_SUCCESS);

    const direct = harness();
    expect(await runCli(["analyze", "calc.y", "--strip-loc"], direct.io)).toBe(EXIT_SUCCESS);
    expect(piped.stdout.join("")).toBe(direct.stdout.join(""));
  });

  it("renders Markdown and writes to a selected output", async () => {
    const test = harness();
    expect(await runCli(["analyze", "calc.y", "--format", "md", "-o", "report.md"], test.io)).toBe(
      EXIT_SUCCESS,
    );
    expect(test.written.get("report.md")).toContain("# Grammar feature report");
  });

  it("validates IR and reports canonical-form failures", async () => {
    const irRun = harness();
    await runCli(["ir", "calc.y"], irRun.io);
    const valid = harness({ "sample.json": irRun.stdout.join("") });
    expect(await runCli(["validate-ir", "sample.json"], valid.io)).toBe(EXIT_SUCCESS);

    const invalidDocument = JSON.parse(irRun.stdout.join("")) as Record<string, unknown>;
    invalidDocument.capabilities = {
      ...(invalidDocument.capabilities as Record<string, unknown>),
      scannerless: true,
    };
    const invalid = harness({ "sample.json": JSON.stringify(invalidDocument) });
    expect(await runCli(["validate-ir", "sample.json"], invalid.io)).toBe(EXIT_FATAL);
    expect(invalid.stderr.join("")).toContain("IR_CANON_SCANNERLESS_CAPABILITY");
  });

  it("detects by extension and content signature", async () => {
    const test = harness();
    expect(await runCli(["detect", "calc.y"], test.io)).toBe(EXIT_SUCCESS);
    expect(test.stdout.join("")).toContain('"frontend": "yacc-family"');
  });

  it("returns usage errors for invalid options", async () => {
    const test = harness();
    expect(await runCli(["analyze", "--format", "xml", "calc.y"], test.io)).toBe(EXIT_USAGE);
  });
});
