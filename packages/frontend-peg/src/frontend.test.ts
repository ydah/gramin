import { readFileSync } from "node:fs";
import { serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { pegFrontend } from "./frontend.js";

const content = readFileSync(new URL("../fixtures/json.peggy", import.meta.url), "utf8");

describe("Peggy frontend", () => {
  it("preserves ordered choice, predicates, and scannerless nodes", () => {
    const result = pegFrontend.parse([{ name: "json.peggy", content }], {});
    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.ir?.capabilities).toMatchObject({
      orderedChoice: true,
      predicates: true,
      scannerless: true,
      ebnfSugar: true,
    });
    expect(result.ir?.rules.find(({ name }) => name === "value")?.orderedAlternatives).toBe(true);
  });

  it("matches location and stripped-location goldens", () => {
    const result = pegFrontend.parse([{ name: "json.peggy", content }], {});
    expect(serializeCanonical(result.ir, { stripLocations: true })).toBe(
      readFileSync(new URL("../fixtures/golden/json.ir.json", import.meta.url), "utf8"),
    );
    expect(serializeCanonical(result.ir)).toBe(
      readFileSync(new URL("../fixtures/golden/json.ir-loc.json", import.meta.url), "utf8"),
    );
  });
});
