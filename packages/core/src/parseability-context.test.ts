import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateFeatures } from "./index.js";

const example: unknown = JSON.parse(
  readFileSync(
    new URL("../../frontend-yacc/fixtures/golden/calc.features.json", import.meta.url),
    "utf8",
  ),
);
const validated = validateFeatures(example);
if (!validated.ok) throw new Error("invalid test features");
const features = validated.value;
const context = {
  representation: "parameter-expansion-bnf-v1",
  sourceRules: 2,
  concreteRules: 3,
  parameterInstances: 1,
  ebnfHelpers: 1,
  omittedTemplateRules: ["option"],
  effectiveCapabilities: { ...features.capabilities, parameterizedRules: false, ebnfSugar: false },
  limits: { instances: 10_000, nodeVisits: 1_000_000, depth: 256, keyBytes: 8_388_608 },
};

describe("derived parseability context", () => {
  it("accepts explicit derived scope without changing source capabilities", () => {
    const result = validateFeatures({
      ...features,
      capabilities: { ...features.capabilities, parameterizedRules: true },
      parseability: { ...features.parseability, context },
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    { ...context, representation: "unknown-policy" },
    { ...context, parameterInstances: -1 },
    { ...context, omittedTemplateRules: ["option", "option"] },
    { ...context, limits: { ...context.limits, nodeVisits: 0 } },
    {
      ...context,
      effectiveCapabilities: { ...context.effectiveCapabilities, parameterizedRules: true },
    },
  ])("rejects invalid derived scope %#", (invalidContext) => {
    expect(
      validateFeatures({
        ...features,
        parseability: { ...features.parseability, context: invalidContext },
      }).ok,
    ).toBe(false);
  });
});
