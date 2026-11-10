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
    expect(markdown).toContain("## Capabilities");
    expect(markdown).not.toContain("Raw SLR counts");
  });

  it("explains how to interpret raw SLR counts", () => {
    const markdown = renderMarkdown({
      ...features,
      parseability: {
        ...features.parseability,
        slr: { states: 12, shiftReduceConflicts: 2, reduceReduceConflicts: 1 },
      },
    });
    expect(markdown).toContain("| `slr.states` | 12 |");
    expect(markdown).toContain("| `slr.shiftReduceConflicts` | 2 |");
    expect(markdown).toContain("| `slr.reduceReduceConflicts` | 1 |");
    expect(markdown).toContain(
      "Raw SLR counts ignore precedence/associativity resolution and cannot be compared to `%expect` declarations.",
    );
  });

  it("suppresses incomplete action numbers in human-readable output", () => {
    const partial = {
      ...features,
      actions: {
        ...features.actions,
        completeness: "partial" as const,
        notApplicable: {
          altActionCoverage: "source action metadata was omitted by the frontend",
        },
      },
    };
    const markdown = renderMarkdown(partial);
    expect(markdown).toContain("| `completeness` | `partial` |");
    expect(markdown).not.toContain("| `altActionCoverage` |");
  });

  it("keeps backticks and pipes inside Markdown table cells", () => {
    const hostile = {
      ...features,
      lexicon: {
        ...features.lexicon,
        punctuationLike: ["`|"],
      },
    };
    const markdown = renderMarkdown(hostile);
    expect(markdown).toContain('``["`\\|"]``');
  });
});
