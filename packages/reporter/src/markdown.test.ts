import { readFileSync } from "node:fs";
import type { GrammarFeatures } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { renderJson, renderMarkdown } from "./index.js";

const features = JSON.parse(
  readFileSync(
    new URL("../../frontend-yacc/fixtures/golden/calc.features.json", import.meta.url),
    "utf8",
  ),
) as GrammarFeatures;

const collectNumbers = (value: unknown): number[] => {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(collectNumbers);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(collectNumbers);
  }
  return [];
};

describe("feature reporters", () => {
  it("renders canonical JSON", () => {
    expect(JSON.parse(renderJson(features))).toEqual(features);
  });

  it("maps every numeric feature into Markdown", () => {
    const markdown = renderMarkdown(features);
    for (const number of collectNumbers(features)) expect(markdown).toContain(String(number));
    expect(markdown).toContain("keywordLike (approximate)");
    expect(markdown).toContain("punctuationLike (approximate)");
  });
});
