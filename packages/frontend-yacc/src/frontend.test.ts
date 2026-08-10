import { readFileSync } from "node:fs";
import { serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { lexYacc, yaccFrontend } from "./index.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

const parseFixture = (name: string) => yaccFrontend.parse([{ name, content: fixture(name) }], {});

describe("yacc-family lexer", () => {
  it("keeps braces and section markers inside opaque blocks synchronized", () => {
    const result = lexYacc(fixture("adversarial-actions.y"));
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.tokens.filter((token) => token.kind === "section")).toHaveLength(1);
    expect(result.tokens.filter((token) => token.kind === "action")).toHaveLength(3);
  });

  it("warns about raw strings and retains later rules", () => {
    const result = parseFixture("raw-string.y");
    expect(result.ir?.rules.map((rule) => rule.name)).toEqual(["first", "second"]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "YACC003_SUSPICIOUS_RAW_STRING",
    );
  });

  it("recovers an unclosed action at the next rule boundary", () => {
    const result = parseFixture("unclosed-action.y");
    expect(result.ir?.rules.map((rule) => rule.name)).toEqual(["broken", "valid"]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "YACC001_UNCLOSED_ACTION",
    );
  });
});

describe("yacc-family parser and lowering", () => {
  it.each([
    "calc.y",
    "empty.y",
    "indirect-recursion.y",
    "alias.y",
    "precedence-override.y",
    "adversarial-actions.y",
    "raw-string.y",
    "bison-named-references.y",
    "lrama.y",
    "json.y",
  ])("produces canonical IR for %s", (name) => {
    const result = parseFixture(name);
    expect(result.ir).not.toBeNull();
    expect(validateIR(result.ir).ok).toBe(true);
  });

  it("resolves a literal alias to the declared named terminal", () => {
    const result = parseFixture("alias.y");
    expect(result.ir?.terminals).toHaveLength(1);
    expect(result.ir?.terminals[0]).toMatchObject({ name: "OPEN", literal: "begin" });
    expect(result.ir?.rules[0]?.alternatives[0]?.items).toEqual([
      { kind: "terminal", name: "OPEN", literal: "begin" },
      { kind: "terminal", name: "OPEN", literal: "begin" },
    ]);
  });

  it("keeps later rules after a malformed rule", () => {
    const result = parseFixture("syntax-error-recovery.y");
    expect(result.ir?.rules.map((rule) => rule.name)).toContain("valid");
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
  });

  it("accepts optional rule terminators and Bison named references", () => {
    const result = parseFixture("bison-named-references.y");
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.ir?.rules.map((rule) => rule.name)).toEqual(["input", "expression"]);
    expect(result.ir?.rules[0]?.alternatives[0]?.items[0]).toMatchObject({
      kind: "symbol",
      name: "expression",
      label: "value",
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["IR012_LOSSY_TERMINAL_LABEL", "IR014_LOSSY_RULE_LABEL"]),
    );
  });

  it("merges repeated rule declarations into one canonical rule", () => {
    const result = yaccFrontend.parse(
      [
        {
          name: "duplicate.y",
          content: "%%\ninput: helper ;\ninput: NUM ;\nhelper: NUM ;\n%%\n",
        },
      ],
      {},
    );
    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.ir?.rules.map((rule) => [rule.name, rule.alternatives.length])).toEqual([
      ["input", 2],
      ["helper", 1],
    ]);
  });

  it("is deterministic with stripped locations", () => {
    const result = parseFixture("calc.y");
    expect(serializeCanonical(result.ir, { stripLocations: true })).toBe(
      serializeCanonical(result.ir, { stripLocations: true }),
    );
  });

  it("preserves Lrama parameters and classifies stdlib calls as external", () => {
    const result = parseFixture("lrama.y");
    expect(result.ir?.source.format).toBe("lrama");
    expect(result.ir?.capabilities.parameterizedRules).toBe(true);
    expect(result.ir?.rules.find((rule) => rule.name === "wrapper")).toMatchObject({
      params: ["X"],
      isInline: true,
      declaredType: "node",
    });
    expect(result.ir?.externalSymbols).toEqual([
      { name: "list", origin: "stdlib", kind: "rule" },
      { name: "option", origin: "stdlib", kind: "rule" },
      { name: "separated_list", origin: "stdlib", kind: "rule" },
    ]);
  });
});
