import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serializeCanonical, validateFeatures, validateIR } from "./index.js";

const ir: unknown = JSON.parse(
  readFileSync(
    new URL("../../frontend-yacc/fixtures/golden/calc.ir.json", import.meta.url),
    "utf8",
  ),
);
const validatedIR = validateIR(ir);
if (!validatedIR.ok) throw new Error("invalid IR fixture");
const features: unknown = JSON.parse(
  readFileSync(
    new URL("../../frontend-yacc/fixtures/golden/calc.features.json", import.meta.url),
    "utf8",
  ),
);
const validatedFeatures = validateFeatures(features);
if (!validatedFeatures.ok) throw new Error("invalid feature fixture");

describe("declared conflict contract", () => {
  it.each([{ shiftReduce: 0, reduceReduce: 2 }, { shiftReduce: 0 }, { reduceReduce: 2 }])(
    "accepts and round trips captured counts %j",
    (counts) => {
      const document = { ...validatedIR.value, irVersion: "1.4.0", expectedConflicts: counts };
      expect(validateIR(document).ok).toBe(true);
      const roundTrip = validateIR(JSON.parse(serializeCanonical(document)));
      expect(roundTrip.ok).toBe(true);
      if (roundTrip.ok) expect(roundTrip.value.expectedConflicts).toEqual(counts);
      const featureDocument = {
        ...validatedFeatures.value,
        parseability: { ...validatedFeatures.value.parseability, declaredConflicts: counts },
      };
      expect(validateFeatures(featureDocument).ok).toBe(true);
      const featureRoundTrip = validateFeatures(JSON.parse(serializeCanonical(featureDocument)));
      expect(featureRoundTrip.ok).toBe(true);
      if (featureRoundTrip.ok) {
        expect(featureRoundTrip.value.parseability.declaredConflicts).toEqual(counts);
      }
    },
  );

  it.each([
    {},
    { shiftReduce: -1 },
    { reduceReduce: -1 },
    { shiftReduce: 1.5 },
    { reduceReduce: 1.5 },
    { shiftReduce: Number.MAX_SAFE_INTEGER + 1 },
    { reduceReduce: Number.MAX_SAFE_INTEGER + 1 },
    { shiftReduce: "0" },
    { shiftReduce: 0, unknown: 2 },
  ])("rejects invalid declared counts at both boundaries: %j", (counts) => {
    expect(validateIR({ ...validatedIR.value, expectedConflicts: counts }).ok).toBe(false);
    expect(
      validateFeatures({
        ...validatedFeatures.value,
        parseability: { ...validatedFeatures.value.parseability, declaredConflicts: counts },
      }).ok,
    ).toBe(false);
  });
});
