import { readFileSync } from "node:fs";
import { serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { menhirFrontend } from "./frontend.js";

const content = readFileSync(new URL("../fixtures/lists.mly", import.meta.url), "utf8");

describe("Menhir frontend", () => {
  it("maps parameterized, inline, and stdlib rules", () => {
    const result = menhirFrontend.parse([{ name: "lists.mly", content }], {});
    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.ir?.capabilities.parameterizedRules).toBe(true);
    expect(result.ir?.rules.find(({ name }) => name === "wrapper")).toMatchObject({
      params: ["X"],
      isInline: true,
      declaredType: "int",
    });
    expect(result.ir?.externalSymbols).toEqual([
      { name: "option", origin: "stdlib", kind: "rule" },
      { name: "separated_list", origin: "stdlib", kind: "rule" },
    ]);
  });

  it("matches location and stripped-location goldens", () => {
    const result = menhirFrontend.parse([{ name: "lists.mly", content }], {});
    expect(serializeCanonical(result.ir, { stripLocations: true })).toBe(
      readFileSync(new URL("../fixtures/golden/lists.ir.json", import.meta.url), "utf8"),
    );
    expect(serializeCanonical(result.ir)).toBe(
      readFileSync(new URL("../fixtures/golden/lists.ir-loc.json", import.meta.url), "utf8"),
    );
  });
});
