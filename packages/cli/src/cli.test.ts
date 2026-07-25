import { describe, expect, it } from "vitest";
import type { CliIO } from "./cli.js";
import { EXIT_FATAL, EXIT_SUCCESS, EXIT_USAGE, runCli } from "./cli.js";

const validIR = JSON.stringify({
  irVersion: "0.2.0",
  source: {
    format: "yacc",
    frontend: { id: "test", version: "0.1.0" },
  },
  capabilities: {
    orderedChoice: false,
    ebnfSugar: false,
    predicates: false,
    scannerless: false,
    precedenceTable: false,
    parameterizedRules: false,
    lexerRules: false,
  },
  startSymbols: ["start"],
  terminals: [],
  externalSymbols: [],
  precedence: [],
  rules: [{ name: "start", alternatives: [{ items: [] }] }],
  diagnostics: [],
});

const harness = (fileContent = validIR) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIO = {
    readTextFile: async () => fileContent,
    writeOut: (text) => stdout.push(text),
    writeError: (text) => stderr.push(text),
  };
  return { io, stdout, stderr };
};

describe("CLI skeleton", () => {
  it("validates an IR document", async () => {
    const test = harness();
    expect(await runCli(["validate-ir", "sample.json"], test.io)).toBe(EXIT_SUCCESS);
    expect(test.stdout.join("")).toBe("valid\n");
  });

  it("reports canonical-form validation failures", async () => {
    const invalid = JSON.parse(validIR) as Record<string, unknown>;
    invalid.capabilities = {
      ...(invalid.capabilities as Record<string, unknown>),
      scannerless: true,
    };
    const test = harness(JSON.stringify(invalid));
    expect(await runCli(["validate-ir", "sample.json"], test.io)).toBe(EXIT_FATAL);
    expect(test.stderr.join("")).toContain("IR_CANON_SCANNERLESS_CAPABILITY");
  });

  it("uses the extension-only detector and threshold", async () => {
    const detected = harness();
    expect(await runCli(["detect", "grammar.y"], detected.io)).toBe(EXIT_SUCCESS);

    const unknown = harness();
    expect(await runCli(["detect", "grammar.txt"], unknown.io)).toBe(EXIT_FATAL);
  });

  it("returns the usage exit code for invalid arguments", async () => {
    const test = harness();
    expect(await runCli([], test.io)).toBe(EXIT_USAGE);
  });
});
