import { readFileSync } from "node:fs";
import { serializeCanonical } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { yaccFrontend } from "./frontend.js";

const goldenCases = [
  "calc",
  "empty",
  "indirect-recursion",
  "alias",
  "precedence-override",
  "adversarial-actions",
  "raw-string",
] as const;

describe("fixture to IR golden files", () => {
  it.each(goldenCases)("matches %s.ir.json", (name) => {
    const content = readFileSync(new URL(`../fixtures/${name}.y`, import.meta.url), "utf8");
    const result = yaccFrontend.parse([{ name: `${name}.y`, content }], {});
    expect(result.ir).not.toBeNull();
    const actual = serializeCanonical(result.ir, { stripLocations: true });
    const expected = readFileSync(
      new URL(`../fixtures/golden/${name}.ir.json`, import.meta.url),
      "utf8",
    );
    expect(actual).toBe(expected);

    const actualWithLocations = serializeCanonical(result.ir);
    const expectedWithLocations = readFileSync(
      new URL(`../fixtures/golden/${name}.ir-loc.json`, import.meta.url),
      "utf8",
    );
    expect(actualWithLocations).toBe(expectedWithLocations);
  });
});
