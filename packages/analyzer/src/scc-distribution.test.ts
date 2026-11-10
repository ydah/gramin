import { readFileSync } from "node:fs";
import { type GrammarIR, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { structureFeatures } from "./structure.js";

const fixture = validateIR(
  JSON.parse(
    readFileSync(
      new URL("../../frontend-yacc/fixtures/golden/empty.ir.json", import.meta.url),
      "utf8",
    ),
  ),
);
if (!fixture.ok) throw new Error("invalid fixture");
const base = { ...fixture.value };
delete base.sourceMetrics;
const rule = (name: string, targets: readonly string[] = []): GrammarIR["rules"][number] => ({
  name,
  alternatives: [{ items: targets.map((target) => ({ kind: "symbol", name: target })) }],
});
const grammar = (rules: GrammarIR["rules"]): GrammarIR => ({
  ...base,
  rules,
  startSymbols: rules.some(({ name }) => name === "H") ? ["H"] : [],
  externalSymbols: [{ name: "external", kind: "rule", origin: "stdlib" }],
});

describe("source SCC size distribution", () => {
  it("counts every source component by size including unreachable and singleton rules", () => {
    const rules = [
      rule("A", ["B"]),
      rule("B", ["A"]),
      rule("C", ["D"]),
      rule("D", ["E"]),
      rule("E", ["C"]),
      rule("F", ["F"]),
      rule("G", ["external"]),
      rule("H", ["A", "G"]),
    ];
    const ir = grammar(rules);
    const result = structureFeatures(ir).features;
    const histogram = result.sccSizeHistogram;
    expect(histogram).toEqual([
      { size: 1, count: 3 },
      { size: 2, count: 1 },
      { size: 3, count: 1 },
    ]);
    expect(histogram?.reduce((total, { size, count }) => total + size * count, 0)).toBe(8);
    expect(histogram?.reduce((total, { count }) => total + count, 0)).toBe(5);
    expect(
      histogram?.filter(({ size }) => size >= 2).reduce((total, { count }) => total + count, 0),
    ).toBe(result.recursionSccCount);
    expect(result.largestSccSize.value).toBe(3);
    expect(structureFeatures(grammar([...rules].reverse())).features.sccSizeHistogram).toEqual(
      histogram,
    );
    const reversedEdges = rules.map((sourceRule) => ({
      ...sourceRule,
      alternatives: sourceRule.alternatives.map((alternative) => ({
        ...alternative,
        items: [...alternative.items].reverse(),
      })),
    }));
    expect(structureFeatures(grammar(reversedEdges)).features.sccSizeHistogram).toEqual(histogram);
  });

  it("records an empty population and isolated rules without zero-size bins", () => {
    expect(structureFeatures(grammar([])).features.sccSizeHistogram).toEqual([]);
    const result = structureFeatures(grammar([rule("A"), rule("B", ["B"])])).features;
    expect(result.sccSizeHistogram).toEqual([{ size: 1, count: 2 }]);
    expect(result.largestSccSize.value).toBe(0);
  });

  it("retains the source graph domain for parameterized definitions", () => {
    const source = grammar([
      { ...rule("template", ["entry"]), params: ["X"] },
      {
        name: "entry",
        alternatives: [
          {
            items: [
              { kind: "symbol", name: "template", args: [{ kind: "terminal", literal: "x" }] },
            ],
          },
        ],
      },
    ]);
    const ir = { ...source, capabilities: { ...source.capabilities, parameterizedRules: true } };
    const validated = validateIR(ir);
    if (!validated.ok) throw new Error(JSON.stringify(validated.issues));
    const before = JSON.stringify(ir);
    expect(structureFeatures(ir).features.sccSizeHistogram).toEqual([{ size: 2, count: 1 }]);
    expect(JSON.stringify(ir)).toBe(before);
  });
});
