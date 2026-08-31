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
    after.redundancy.unusedTerminals = [...before.redundancy.unusedTerminals, "EXTRA"];
    after.redundancy.unusedPrecedenceTokens = ["STALE"];

    const diff = diffFeatures(before, after);

    expect(diff.regressions.map((regression) => regression.path).sort()).toEqual(
      [
        "/redundancy/unusedPrecedenceTokens",
        "/redundancy/unusedTerminals",
        "/structure/unreachableSymbols",
        "/structure/unproductiveSymbols",
      ].sort(),
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
      irVersion: "1.3.0",
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

  it("tracks parsing metadata but ignores action-only metadata", () => {
    const features = fixtureFeatures();
    const grammar = (
      orderedAlternatives: boolean,
      codeLength: number,
      label: string,
    ): GrammarIR => ({
      irVersion: "1.3.0",
      source: features.source,
      capabilities: { ...features.capabilities, orderedChoice: orderedAlternatives },
      startSymbols: ["start"],
      terminals: [],
      externalSymbols: [],
      precedence: [],
      rules: [
        {
          name: "start",
          ...(orderedAlternatives ? { orderedAlternatives: true } : {}),
          alternatives: [
            {
              items: [
                { kind: "midRuleAction", codeLength },
                { kind: "symbol", name: "value", label },
              ],
            },
          ],
        },
        { name: "value", alternatives: [{ items: [] }] },
      ],
      diagnostics: [],
    });
    const beforeIR = grammar(false, 1, "before");
    const actionOnly = diffFeatures(features, structuredClone(features), {
      beforeIR,
      afterIR: grammar(false, 99, "after"),
    });
    const ordered = diffFeatures(features, structuredClone(features), {
      beforeIR,
      afterIR: grammar(true, 1, "before"),
    });

    expect(actionOnly.structural).toMatchObject({ editDistance: 0, changedRules: [] });
    expect(ordered.structural?.changedRules).toEqual(["start"]);
    expect(ordered.structural?.editDistance).toBeGreaterThan(0);
  });

  it("orders structural rule names by UTF-8 bytes", () => {
    const features = fixtureFeatures();
    const grammar = (literal: string): GrammarIR => ({
      irVersion: "1.3.0",
      source: features.source,
      capabilities: features.capabilities,
      startSymbols: [],
      terminals: [],
      externalSymbols: [],
      precedence: [],
      rules: [
        { name: "\u{1D400}x", alternatives: [{ items: [{ kind: "terminal", literal }] }] },
        { name: "\uFF21x", alternatives: [{ items: [{ kind: "terminal", literal }] }] },
      ],
      diagnostics: [],
    });
    const diff = diffFeatures(features, structuredClone(features), {
      beforeIR: grammar("a"),
      afterIR: grammar("b"),
    });

    expect(diff.structural?.changedRules).toEqual(["\uFF21x", "\u{1D400}x"]);
  });
});
