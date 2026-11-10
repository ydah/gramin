import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateFeatures } from "./index.js";

const fixture = validateFeatures(
  JSON.parse(
    readFileSync(
      new URL("../../frontend-yacc/fixtures/golden/calc.features.json", import.meta.url),
      "utf8",
    ),
  ),
);
if (!fixture.ok) throw new Error("invalid fixture");
const base = fixture.value;
const withHistogram = (sccSizeHistogram: unknown) => ({
  ...base,
  structure: { ...base.structure, sccSizeHistogram },
});

describe("SCC size histogram schema", () => {
  it("accepts recorded empty and positive source-component populations", () => {
    expect(validateFeatures(withHistogram([])).ok).toBe(true);
    expect(
      validateFeatures(
        withHistogram([
          { size: 1, count: 3 },
          { size: 2, count: 1 },
        ]),
      ).ok,
    ).toBe(true);
    expect(validateFeatures(base).ok).toBe(true);
  });

  it.each([
    { size: 0, count: 1 },
    { size: 1, count: 0 },
    { size: -1, count: 2 },
    { size: 1, count: -2 },
    { size: 1.5, count: 1 },
    { size: 2, count: 1.5 },
    { size: 1 },
    { count: 1 },
    { size: 1, count: 1, extra: true },
  ])("rejects invalid histogram bins %#", (bin) => {
    expect(validateFeatures(withHistogram([bin])).ok).toBe(false);
  });
});
