import { readFileSync } from "node:fs";
import type { GrammarFeatures } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { diffFeatures } from "./diff.js";

const fixtureFeatures = (): GrammarFeatures =>
  JSON.parse(
    readFileSync(
      new URL("../../frontend-yacc/fixtures/golden/calc.features.json", import.meta.url),
      "utf8",
    ),
  ) as GrammarFeatures;

describe("feature diffs", () => {
  it("reports growing structural issue lists as regressions", () => {
    const before = fixtureFeatures();
    const after = structuredClone(before);
    after.structure.unreachableSymbols = ["orphan"];
    after.structure.unproductiveSymbols = ["loop"];

    const diff = diffFeatures(before, after);

    expect(diff.regressions.map((regression) => regression.path).sort()).toEqual(
      ["/structure/unreachableSymbols", "/structure/unproductiveSymbols"].sort(),
    );
  });

  it("does not report identical arrays as changes", () => {
    const features = fixtureFeatures();
    const diff = diffFeatures(features, structuredClone(features));

    expect(diff.changes).toEqual([]);
    expect(diff.regressions).toEqual([]);
  });
});
