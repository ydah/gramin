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

describe("FIRST and FOLLOW bitsets", () => {
  it("preserves FIRST, FOLLOW, LL(1), and SLR across more than two words", () => {
    const token = (index: number) => ({ kind: "terminal" as const, literal: `語${index}` });
    const result = parseabilityAnalysis(
      grammar([
        {
          name: "start",
          alternatives: [
            ...Array.from({ length: 70 }, (_, index) => ({
              items: [{ kind: "symbol" as const, name: "空" }, token(index)],
            })),
            ...[31, 63, 69].map((index) => ({ items: [token(index)] })),
          ],
        },
        { name: "空", alternatives: [{ items: [] }] },
      ]),
      { lr: true },
    );

    expect(result.features).toMatchObject({
      firstSetSize: {
        average: 35,
        maximum: { rule: "start", value: 70 },
        percentiles: { p50: 0, p95: 70 },
      },
      followSetSize: {
        average: 35.5,
        maximum: { rule: "空", value: 70 },
        percentiles: { p50: 1, p95: 70 },
      },
      ll1Conflicts: { firstFirst: 3, firstFollow: 0, total: 3 },
      slr: {
        states: 76,
        shiftReduceConflicts: 3,
        reduceReduceConflicts: 0,
        conflictInvolvement: {
          total: 6,
          involvedRules: 2,
          ruleRatio: 1,
          percentiles: { p50: 3, p95: 3 },
        },
      },
    });
    expect(result.perRule.get("start")).toMatchObject({
      firstSetSize: 70,
      followSetSize: 1,
      slrConflictInvolvement: 3,
    });
    expect(result.perRule.get("空")).toMatchObject({
      firstSetSize: 0,
      followSetSize: 70,
      slrConflictInvolvement: 3,
    });
  });

  it("propagates FOLLOW through nullable EBNF without aliasing FIRST", () => {
    const result = parseabilityAnalysis({
      ...grammar([
        {
          name: "start",
          alternatives: [
            {
              items: [
                {
                  kind: "star",
                  expr: {
                    kind: "group",
                    expr: {
                      kind: "seq",
                      items: [
                        { kind: "opt", expr: { kind: "symbol", name: "空" } },
                        { kind: "terminal", literal: "x" },
                      ],
                    },
                  },
                },
                { kind: "plus", expr: { kind: "symbol", name: "空" } },
                { kind: "terminal", literal: "y" },
                { kind: "opt", expr: { kind: "symbol", name: "空" } },
              ],
            },
          ],
        },
        {
          name: "空",
          alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }, { items: [] }],
        },
      ]),
      capabilities: { ...base.capabilities, ebnfSugar: true },
    });

    expect(result.perRule.get("start")).toMatchObject({ firstSetSize: 2, followSetSize: 1 });
    expect(result.perRule.get("空")).toMatchObject({ firstSetSize: 1, followSetSize: 3 });
    expect(result.features.ll1Conflicts).toEqual({ firstFirst: 0, firstFollow: 1, total: 1 });
  });

  it("keeps terminal namespaces distinct and ignores unused declarations", () => {
    const result = parseabilityAnalysis({
      ...grammar([
        {
          name: "start",
          alternatives: [
            { items: [{ kind: "terminal", name: "字" }] },
            { items: [{ kind: "terminal", literal: "字" }] },
            { items: [{ kind: "charClass", pattern: "字" }] },
            { items: [{ kind: "anyChar" }] },
            { items: [{ kind: "symbol", name: "字" }] },
          ],
        },
      ]),
      capabilities: { ...base.capabilities, scannerless: true },
      terminals: [{ name: "未使用" }],
      externalSymbols: [{ name: "字", kind: "terminal", origin: "test" }],
    });

    expect(result.perRule.get("start")).toMatchObject({ firstSetSize: 5, followSetSize: 1 });
    expect(result.features.ll1Conflicts).toEqual({ firstFirst: 0, firstFollow: 0, total: 0 });
  });
});

describe("SLR conflict involvement", () => {
  it("attributes a shift/reduce cell to both contributing rules", () => {
    const result = parseabilityAnalysis(
      grammar([
        {
          name: "start",
          alternatives: [
            {
              items: [
                { kind: "symbol", name: "a" },
                { kind: "terminal", literal: "x" },
              ],
            },
            { items: [{ kind: "terminal", literal: "x" }] },
          ],
        },
        { name: "a", alternatives: [{ items: [] }] },
      ]),
      { lr: true },
    );

    expect(result.features.slr).toEqual({
      states: 5,
      shiftReduceConflicts: 1,
      reduceReduceConflicts: 0,
      conflictInvolvement: {
        total: 2,
        involvedRules: 2,
        ruleRatio: 1,
        percentiles: { p50: 1, p95: 1 },
      },
    });
    expect(result.perRule.get("start")?.slrConflictInvolvement).toBe(1);
    expect(result.perRule.get("a")?.slrConflictInvolvement).toBe(1);
  });

  const reduceReduceRules: GrammarIR["rules"] = [
    {
      name: "start",
      alternatives: [
        { items: [{ kind: "symbol", name: "a" }] },
        { items: [{ kind: "symbol", name: "b" }] },
      ],
    },
    { name: "a", alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }] },
    { name: "b", alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }] },
  ];

  it("includes zero-valued rules in a reduce/reduce distribution", () => {
    const result = parseabilityAnalysis(grammar(reduceReduceRules), { lr: true });

    expect(result.features.slr?.conflictInvolvement).toEqual({
      total: 2,
      involvedRules: 2,
      ruleRatio: 0.6667,
      percentiles: { p50: 1, p95: 1 },
    });
    expect([...result.perRule].map(([name, rule]) => [name, rule.slrConflictInvolvement])).toEqual([
      ["start", 0],
      ["a", 1],
      ["b", 1],
    ]);
  });

  it("samples unreachable zero-valued rules with nearest-rank percentiles", () => {
    const result = parseabilityAnalysis(
      grammar([
        ...reduceReduceRules,
        ...Array.from({ length: 17 }, (_, index) => ({
          name: `unused${index}`,
          alternatives: [{ items: [] }],
        })),
      ]),
      { lr: true },
    );

    expect(result.features.slr?.conflictInvolvement).toEqual({
      total: 2,
      involvedRules: 2,
      ruleRatio: 0.1,
      percentiles: { p50: 0, p95: 1 },
    });
  });

  it("counts distinct items behind the same shift action", () => {
    const result = parseabilityAnalysis(
      grammar([
        {
          name: "start",
          alternatives: [
            {
              items: [
                { kind: "symbol", name: "a" },
                { kind: "terminal", literal: "x" },
              ],
            },
            {
              items: [
                { kind: "terminal", literal: "x" },
                { kind: "terminal", literal: "y" },
              ],
            },
            {
              items: [
                { kind: "terminal", literal: "x" },
                { kind: "terminal", literal: "z" },
              ],
            },
          ],
        },
        { name: "a", alternatives: [{ items: [] }] },
      ]),
      { lr: true },
    );

    expect(result.features.slr?.shiftReduceConflicts).toBe(1);
    expect(result.features.slr?.reduceReduceConflicts).toBe(0);
    expect(result.perRule.get("start")?.slrConflictInvolvement).toBe(2);
    expect(result.perRule.get("a")?.slrConflictInvolvement).toBe(1);
    expect(result.features.slr?.conflictInvolvement?.total).toBe(3);
  });

  it("counts an item once in a cell with both conflict kinds", () => {
    const result = parseabilityAnalysis(
      grammar([
        {
          name: "start",
          alternatives: [
            {
              items: [
                { kind: "symbol", name: "a" },
                { kind: "terminal", literal: "x" },
              ],
            },
            {
              items: [
                { kind: "symbol", name: "b" },
                { kind: "terminal", literal: "x" },
              ],
            },
            { items: [{ kind: "terminal", literal: "x" }] },
          ],
        },
        { name: "a", alternatives: [{ items: [] }] },
        { name: "b", alternatives: [{ items: [] }] },
      ]),
      { lr: true },
    );

    expect(result.features.slr?.shiftReduceConflicts).toBe(1);
    expect(result.features.slr?.reduceReduceConflicts).toBe(1);
    expect(result.features.slr?.conflictInvolvement?.total).toBe(3);
    expect([...result.perRule.values()].map((rule) => rule.slrConflictInvolvement)).toEqual([
      1, 1, 1,
    ]);
  });

  it("counts a completed item separately for each conflicting FOLLOW token", () => {
    const result = parseabilityAnalysis(
      grammar([
        {
          name: "start",
          alternatives: ["a", "b"].flatMap((name) =>
            ["x", "y"].map((literal) => ({
              items: [
                { kind: "symbol" as const, name },
                { kind: "terminal" as const, literal },
              ],
            })),
          ),
        },
        { name: "a", alternatives: [{ items: [{ kind: "terminal", literal: "z" }] }] },
        { name: "b", alternatives: [{ items: [{ kind: "terminal", literal: "z" }] }] },
      ]),
      { lr: true },
    );

    expect(result.features.slr?.reduceReduceConflicts).toBe(2);
    expect(result.features.slr?.conflictInvolvement?.total).toBe(4);
    expect(result.perRule.get("a")?.slrConflictInvolvement).toBe(2);
    expect(result.perRule.get("b")?.slrConflictInvolvement).toBe(2);
  });

  it("keeps measured zeros when there are rules but no start", () => {
    const result = parseabilityAnalysis(grammar(reduceReduceRules, []), { lr: true });

    expect(result.features.slr?.conflictInvolvement).toEqual({
      total: 0,
      involvedRules: 0,
      ruleRatio: 0,
      percentiles: { p50: 0, p95: 0 },
    });
    expect([...result.perRule.values()].every((rule) => rule.slrConflictInvolvement === 0)).toBe(
      true,
    );
  });

  it("omits empty-domain ratios and percentiles with precise reasons", () => {
    const result = parseabilityAnalysis(grammar([], []), { lr: true });

    expect(result.features.slr?.conflictInvolvement).toEqual({ total: 0, involvedRules: 0 });
    expect(result.features.notApplicable).toMatchObject({
      "slr.conflictInvolvement.ruleRatio": "grammar has no rules",
      "slr.conflictInvolvement.percentiles": "grammar has no rules",
    });
  });

  it("omits per-rule involvement when SLR is not requested or supported", () => {
    const unrequested = parseabilityAnalysis(grammar(reduceReduceRules));
    const unsupported = parseabilityAnalysis(
      grammar([
        {
          name: "start",
          alternatives: [{ items: [{ kind: "opt", expr: { kind: "terminal", literal: "x" } }] }],
        },
      ]),
      { lr: true },
    );

    for (const result of [unrequested, unsupported]) {
      expect(result.features.slr).toBeUndefined();
      expect(result.features.notApplicable?.slr).toBeDefined();
      expect(result.perRule.get("start")).not.toHaveProperty("slrConflictInvolvement");
    }
  });

  it("samples concrete parameter instances while preserving source rule rows", () => {
    const ir = grammar([
      {
        name: "start",
        alternatives: [
          {
            items: [{ kind: "symbol", name: "p", args: [{ kind: "terminal", literal: "x" }] }],
          },
        ],
      },
      {
        name: "p",
        params: ["X"],
        alternatives: [
          {
            items: [
              { kind: "symbol", name: "a" },
              { kind: "symbol", name: "X" },
            ],
          },
          { items: [{ kind: "symbol", name: "X" }] },
        ],
      },
      { name: "a", alternatives: [{ items: [] }] },
    ]);
    const result = parseabilityAnalysis(
      { ...ir, capabilities: { ...ir.capabilities, parameterizedRules: true } },
      { lr: true },
    );

    expect(result.features.slr?.conflictInvolvement).toEqual({
      total: 2,
      involvedRules: 2,
      ruleRatio: 0.6667,
      percentiles: { p50: 1, p95: 1 },
    });
    expect([...result.perRule.keys()]).toEqual(["start", "p", "a"]);
    expect(result.perRule.get("start")?.slrConflictInvolvement).toBe(0);
    expect(result.perRule.get("a")?.slrConflictInvolvement).toBe(1);
    expect(result.perRule.get("p")).not.toHaveProperty("slrConflictInvolvement");
  });
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
      conflictInvolvement: {
        total: 2,
        involvedRules: 1,
        ruleRatio: 1,
        percentiles: { p50: 2, p95: 2 },
      },
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
      conflictInvolvement: {
        total: 2,
        involvedRules: 2,
        ruleRatio: 0.6667,
        percentiles: { p50: 1, p95: 1 },
      },
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
      conflictInvolvement: {
        total: 0,
        involvedRules: 0,
        ruleRatio: 0,
        percentiles: { p50: 0, p95: 0 },
      },
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
      conflictInvolvement: {
        total: 2,
        involvedRules: 2,
        ruleRatio: 0.6667,
        percentiles: { p50: 1, p95: 1 },
      },
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
      conflictInvolvement: {
        total: 2,
        involvedRules: 2,
        ruleRatio: 1,
        percentiles: { p50: 1, p95: 1 },
      },
    });
    expect(parseabilityAnalysis(grammar(rules, []), { lr: true }).features.slr).toEqual({
      states: 0,
      shiftReduceConflicts: 0,
      reduceReduceConflicts: 0,
      conflictInvolvement: {
        total: 0,
        involvedRules: 0,
        ruleRatio: 0,
        percentiles: { p50: 0, p95: 0 },
      },
    });
  });
});
