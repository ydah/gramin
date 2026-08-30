import { readFileSync } from "node:fs";
import type { GrammarFeatures, GrammarIR } from "@gramin/core";
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

  it("reports structural edit distance and dependency blast radius", () => {
    const features = fixtureFeatures();
    const grammar = (literal: string): GrammarIR => ({
      irVersion: "1.2.0",
      source: features.source,
      capabilities: features.capabilities,
      startSymbols: ["start"],
      terminals: [],
      externalSymbols: [],
      precedence: [],
      rules: [
        { name: "start", alternatives: [{ items: [{ kind: "symbol", name: "value" }] }] },
        { name: "value", alternatives: [{ items: [{ kind: "terminal", literal }] }] },
      ],
      diagnostics: [],
    });
    const beforeIR = grammar("a");
    const afterIR = grammar("b");
    const diff = diffFeatures(features, structuredClone(features), { beforeIR, afterIR });

    expect(diff.structural).toMatchObject({
      changedRules: ["value"],
      blastRadius: { forward: 1, reverse: 2, total: 2, rules: ["start", "value"] },
    });
    expect(diff.structural?.editDistance).toBeGreaterThan(0);
  });
});
