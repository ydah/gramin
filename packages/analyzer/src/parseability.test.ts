import { readFileSync } from "node:fs";
import { type GrammarIR, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { parseabilityAnalysis } from "./parseability.js";

const fixture = validateIR(
  JSON.parse(
    readFileSync(
      new URL("../../frontend-yacc/fixtures/golden/empty.ir.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);
if (!fixture.ok) throw new Error("invalid empty.ir.json fixture");
const base = fixture.value;

const grammar = (rules: GrammarIR["rules"], startSymbols: string[] = ["start"]): GrammarIR => ({
  ...base,
  rules,
  startSymbols,
});

describe("SLR state construction", () => {
  it("preserves shift/reduce conflicts in a recursive expression grammar", () => {
    const result = parseabilityAnalysis(
      grammar([
        {
          name: "start",
          alternatives: [
            {
              items: [
                { kind: "symbol", name: "start" },
                { kind: "terminal", literal: "+" },
                { kind: "symbol", name: "start" },
              ],
            },
            { items: [{ kind: "terminal", literal: "id" }] },
          ],
        },
      ]),
      { lr: true },
    );
    expect(result.features.slr).toEqual({
      states: 5,
      shiftReduceConflicts: 1,
      reduceReduceConflicts: 0,
    });
  });

  it("preserves reduce/reduce conflicts with Unicode rule and terminal names", () => {
    const result = parseabilityAnalysis(
      grammar(
        [
          {
            name: "開始",
            alternatives: [
              { items: [{ kind: "symbol", name: "Ａ" }] },
              { items: [{ kind: "symbol", name: "𝐀" }] },
            ],
          },
          {
            name: "Ａ",
            alternatives: [{ items: [{ kind: "terminal", name: "日本語" }] }],
          },
          {
            name: "𝐀",
            alternatives: [{ items: [{ kind: "terminal", name: "日本語" }] }],
          },
        ],
        ["開始"],
      ),
      { lr: true },
    );
    expect(result.features.slr).toEqual({
      states: 5,
      shiftReduceConflicts: 0,
      reduceReduceConflicts: 1,
    });
  });

  it("reuses kernels reached through multiple recursive transitions", () => {
    const result = parseabilityAnalysis(
      grammar([
        {
          name: "start",
          alternatives: [
            {
              items: [
                { kind: "terminal", literal: "a" },
                { kind: "symbol", name: "start" },
              ],
            },
            {
              items: [
                { kind: "terminal", literal: "b" },
                { kind: "symbol", name: "start" },
              ],
            },
            { items: [] },
          ],
        },
      ]),
      { lr: true },
    );
    expect(result.features.slr).toEqual({
      states: 6,
      shiftReduceConflicts: 0,
      reduceReduceConflicts: 0,
    });
  });

  it("terminates closure expansion through a nullable cycle", () => {
    const result = parseabilityAnalysis(
      grammar([
        { name: "start", alternatives: [{ items: [{ kind: "symbol", name: "a" }] }] },
        {
          name: "a",
          alternatives: [
            { items: [{ kind: "symbol", name: "b" }] },
            { items: [{ kind: "terminal", literal: "x" }] },
          ],
        },
        {
          name: "b",
          alternatives: [{ items: [{ kind: "symbol", name: "a" }] }, { items: [] }],
        },
      ]),
      { lr: true },
    );
    expect(result.features.slr).toEqual({
      states: 5,
      shiftReduceConflicts: 0,
      reduceReduceConflicts: 1,
    });
  });

  it("preserves completed augmented items for multiple starts", () => {
    const rules: GrammarIR["rules"] = [
      { name: "a", alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }] },
      { name: "b", alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }] },
    ];
    expect(parseabilityAnalysis(grammar(rules, ["a", "b"]), { lr: true }).features.slr).toEqual({
      states: 4,
      shiftReduceConflicts: 0,
      reduceReduceConflicts: 1,
    });
    expect(parseabilityAnalysis(grammar(rules, []), { lr: true }).features.slr).toEqual({
      states: 0,
      shiftReduceConflicts: 0,
      reduceReduceConflicts: 0,
    });
  });
});
