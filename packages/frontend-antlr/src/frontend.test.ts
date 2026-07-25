import { readFileSync } from "node:fs";
import { serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { antlrFrontend } from "./frontend.js";

const content = readFileSync(new URL("../fixtures/Labels.g4", import.meta.url), "utf8");

describe("ANTLR4 frontend", () => {
  it("lowers parser rules, labels, lexer terminals, and loss diagnostics", () => {
    const result = antlrFrontend.parse([{ name: "Labels.g4", content }], {});
    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.ir?.capabilities).toMatchObject({ ebnfSugar: true, lexerRules: true });
    expect(result.ir?.rules.find(({ name }) => name === "item")?.alternatives).toMatchObject([
      { label: "Identifier" },
      { label: "List" },
      { label: "Guarded" },
    ]);
    expect(result.ir?.terminals.map(({ name }) => name)).not.toContain("DIGIT");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["IR011_LOSSY_SEMANTIC_PREDICATE", "IR016_LOSSY_ANTLR_FRAGMENT"]),
    );
  });

  it("matches location and stripped-location goldens", () => {
    const result = antlrFrontend.parse([{ name: "Labels.g4", content }], {});
    expect(serializeCanonical(result.ir, { stripLocations: true })).toBe(
      readFileSync(new URL("../fixtures/golden/labels.ir.json", import.meta.url), "utf8"),
    );
    expect(serializeCanonical(result.ir)).toBe(
      readFileSync(new URL("../fixtures/golden/labels.ir-loc.json", import.meta.url), "utf8"),
    );
  });

  it("resolves tokenVocab terminals from a companion lexer", () => {
    const parser = `parser grammar SplitParser;
options { tokenVocab=SplitLexer; }
start: NAME EOF;`;
    const lexer = `lexer grammar SplitLexer;
NAME: [a-z]+;
WS: [ \\t\\r\\n]+ -> skip;`;
    const result = antlrFrontend.parse(
      [
        { name: "SplitParser.g4", content: parser },
        { name: "SplitLexer.g4", content: lexer },
      ],
      {},
    );
    expect(result.ir?.externalSymbols).toContainEqual({
      name: "NAME",
      origin: "import",
      kind: "terminal",
    });
    expect(validateIR(result.ir).ok).toBe(true);
  });
});
