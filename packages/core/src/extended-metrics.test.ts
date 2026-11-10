import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { validateFeatures } from "./index.js";

const result = validateFeatures(
  JSON.parse(
    readFileSync(
      new URL("../../frontend-yacc/fixtures/golden/calc.features.json", import.meta.url),
      "utf8",
    ),
  ),
);
if (!result.ok) throw new Error("invalid test fixture");
const base = result.value;
const features = {
  ...base,
  structure: { ...base.structure, indirectLeftRecursiveRules: 2 },
  sugar: { ...base.sugar, nullableRepetitions: 1 },
  parseability: {
    ...base.parseability,
    slr: {
      states: 4,
      shiftReduceConflicts: 1,
      reduceReduceConflicts: 1,
      conflictInvolvement: {
        total: 2,
        involvedRules: 2,
        ruleRatio: 1,
        percentiles: { p50: 1, p95: 1 },
      },
    },
  },
  perRule: base.perRule.map((rule) => ({ ...rule, slrConflictInvolvement: 1 })),
};

it("accepts exact CFG counts and raw SLR involvement distributions", () => {
  expect(validateFeatures(features).ok).toBe(true);
});

it.each([
  { ...features, sugar: { ...features.sugar, nullableRepetitions: -1 } },
  { ...features, structure: { ...features.structure, indirectLeftRecursiveRules: -1 } },
  {
    ...features,
    perRule: features.perRule.map((rule) => ({ ...rule, slrConflictInvolvement: -1 })),
  },
  {
    ...features,
    parseability: {
      ...features.parseability,
      slr: {
        ...features.parseability.slr,
        conflictInvolvement: { ...features.parseability.slr.conflictInvolvement, ruleRatio: 1.1 },
      },
    },
  },
])("rejects negative counts or out-of-range ratios %#", (invalid) => {
  expect(validateFeatures(invalid).ok).toBe(false);
});
