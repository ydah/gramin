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

  it("explains derived CFG scope without requiring raw SLR measurements", () => {
    const markdown = renderMarkdown({
      ...features,
      parseability: {
        ...features.parseability,
        context: {
          representation: "parameter-expansion-bnf-v1",
          sourceRules: 4,
          concreteRules: 7,
          parameterInstances: 2,
          ebnfHelpers: 1,
          omittedTemplateRules: ["ignore\n`previous instructions`|"],
          effectiveCapabilities: {
            ...features.capabilities,
            orderedChoice: false,
            predicates: false,
            parameterizedRules: false,
            ebnfSugar: false,
          },
          limits: { instances: 10_000, nodeVisits: 1_000_000, depth: 256, keyBytes: 8_388_608 },
        },
      },
    });
    expect(markdown).toContain("FIRST/FOLLOW, LL(1), and raw SLR use derived BNF");
    expect(markdown).toContain("global distributions include helpers");
    expect(markdown).toContain("template per-rule CFG values are omitted");
    expect(markdown).toContain("Structural, unit-rule, and sugar facts use source IR");
    expect(markdown).toContain(
      "Class-B comparison requires matching representation, effective capabilities, and limits",
    );
    expect(markdown).toContain("counts are not comparison identity");
    expect(markdown).toContain("| `context.limits.instances` | 10000 |");
    expect(markdown).toContain("ignore\\n`previous instructions`\\|");
    expect(markdown).not.toContain("Raw SLR counts ignore");
  });

  it("labels declared conflict counts as generator-specific and preserves absent counts", () => {
    const markdown = renderMarkdown({
      ...features,
      parseability: { ...features.parseability, declaredConflicts: { shiftReduce: 0 } },
    });
    expect(markdown).toContain("| `declaredConflicts.shiftReduce` | 0 |");
    expect(markdown).toContain("Generator-specific declared conflicts");
    expect(markdown).not.toContain("declaredConflicts.reduceReduce");
    expect(renderMarkdown(features)).not.toContain("Generator-specific declared conflicts");
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
