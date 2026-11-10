import { readFileSync } from "node:fs";
import { type GrammarFeatures, type GrammarIR, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { diffFeatures, renderFeatureDiffJson, renderFeatureDiffMarkdown } from "./diff.js";

const fixtureFeatures = (): GrammarFeatures =>
  JSON.parse(
    readFileSync(
      new URL("../../frontend-yacc/fixtures/golden/calc.features.json", import.meta.url),
      "utf8",
    ),
  ) as GrammarFeatures;

const concreteContext = (
  features: GrammarFeatures,
): NonNullable<GrammarFeatures["parseability"]["context"]> => ({
  representation: "parameter-expansion-bnf-v1",
  sourceRules: features.size.rules,
  concreteRules: 3,
  parameterInstances: 1,
  ebnfHelpers: 1,
  omittedTemplateRules: ["template"],
  effectiveCapabilities: {
    ...features.capabilities,
    orderedChoice: false,
    predicates: false,
    parameterizedRules: false,
    ebnfSugar: false,
  },
  limits: { instances: 10000, nodeVisits: 1000000, depth: 256, keyBytes: 8388608 },
});

const parameterizedGrammar = (rules: GrammarIR["rules"]): GrammarIR => {
  const result = validateIR({
    irVersion: "1.4.0",
    source: { format: "lrama", dialect: "lrama", frontend: { id: "test", version: "1.0.0" } },
    capabilities: {
      orderedChoice: false,
      ebnfSugar: false,
      predicates: false,
      scannerless: false,
      precedenceTable: false,
      parameterizedRules: true,
      lexerRules: false,
    },
    startSymbols: ["start"],
    terminals: [],
    externalSymbols: [],
    precedence: [],
    rules,
    diagnostics: [],
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};

describe("feature diffs", () => {
  it("matches source rows by name and orders escaped field paths deterministically", () => {
    const before = fixtureFeatures();
    const row = before.perRule[0];
    if (!row) throw new Error("fixture needs a rule");
    before.perRule = [
      { ...row, rule: "removed" },
      { ...row, rule: "a/~" },
      { ...row, rule: "\u{1D400}x" },
      { ...row, rule: "\uFF21x" },
    ];
    const after = structuredClone(before);
    after.perRule = [
      { ...row, rule: "\u{1D400}x", fanOut: row.fanOut + 1 },
      { ...row, rule: "added" },
      { ...row, rule: "\uFF21x", fanOut: row.fanOut + 1 },
      { ...row, rule: "a/~", alternatives: row.alternatives + 1 },
    ];
    const diff = diffFeatures(before, after);

    expect(diff.changes.map(({ path, kind }) => ({ path, kind }))).toEqual([
      { path: "/perRule/a~1~0/alternatives", kind: "changed" },
      { path: "/perRule/added", kind: "added" },
      { path: "/perRule/removed", kind: "removed" },
      { path: "/perRule/\uFF21x/fanOut", kind: "changed" },
      { path: "/perRule/\u{1D400}x/fanOut", kind: "changed" },
    ]);
    expect(diff.changes.find(({ kind }) => kind === "added")?.after).toEqual({
      ...row,
      rule: "added",
    });
    const reordered = structuredClone(before);
    reordered.perRule.reverse();
    expect(diffFeatures(before, reordered).changes).toEqual([]);
  });

  it("omits incompatible class-B numeric changes while preserving class-A changes", () => {
    const before = fixtureFeatures();
    const after = structuredClone(before);
    after.capabilities.ebnfSugar = !before.capabilities.ebnfSugar;
    after.structure.recursionSccCount += 1;
    after.size.rules += 1;
    const diff = diffFeatures(before, after);

    expect(diff.changes.map(({ path }) => path)).not.toContain("/structure/recursionSccCount");
    expect(diff.regressions.map(({ path }) => path)).toEqual(["/size/rules"]);
    expect(diff).toMatchObject({
      notComparable: [
        {
          path: "/structure/recursionSccCount",
          class: "B",
          reason: expect.stringContaining("capabilities"),
        },
      ],
    });
  });

  it("gates derived CFG fields even when source capabilities match", () => {
    const before = fixtureFeatures();
    const after = structuredClone(before);
    after.parseability.context = concreteContext(after);
    if (!after.parseability.ll1Conflicts) throw new Error("fixture needs CFG conflicts");
    after.parseability.ll1Conflicts.total += 1;
    after.parseability.unitRules += 1;
    const diff = diffFeatures(before, after);

    expect(diff.changes.map(({ path }) => path)).toContain("/parseability/unitRules");
    expect(diff.changes.map(({ path }) => path)).not.toContain("/parseability/ll1Conflicts/total");
    expect(diff.regressions).toEqual([]);
    expect(diff).toMatchObject({
      notComparable: [
        {
          path: "/parseability/ll1Conflicts/total",
          class: "B",
          reason: expect.stringContaining("representation"),
        },
      ],
    });
  });

  it("compares derived samples with different counts but rejects changed limits", () => {
    const before = fixtureFeatures();
    before.parseability.context = concreteContext(before);
    const after = structuredClone(before);
    if (!after.parseability.ll1Conflicts) throw new Error("fixture needs CFG conflicts");
    after.parseability.context = {
      ...structuredClone(before.parseability.context),
      concreteRules: 9,
      parameterInstances: 4,
      ebnfHelpers: 4,
      omittedTemplateRules: ["other-template"],
    };
    after.parseability.ll1Conflicts.total += 1;

    expect(diffFeatures(before, after).regressions.map(({ path }) => path)).toEqual([
      "/parseability/ll1Conflicts/total",
    ]);
    after.parseability.context.limits.depth += 1;
    const diff = diffFeatures(before, after);
    expect(diff.regressions).toEqual([]);
    expect(diff).toMatchObject({
      notComparable: [
        {
          path: "/parseability/ll1Conflicts/total",
          class: "B",
          reason: expect.stringContaining("limits"),
        },
      ],
    });
  });

  it("keeps unavailable local CFG values distinct from measured zero", () => {
    const before = fixtureFeatures();
    const row = before.perRule[0];
    if (!row) throw new Error("fixture needs a rule");
    delete row.firstSetSize;
    const after = structuredClone(before);
    const afterRow = after.perRule[0];
    if (!afterRow) throw new Error("fixture needs a rule");
    afterRow.firstSetSize = 0;
    const diff = diffFeatures(before, after);

    expect(diff.changes).toEqual([]);
    expect(diff.regressions).toEqual([]);
    expect(diff).toMatchObject({
      notComparable: [
        {
          path: `/perRule/${row.rule}/firstSetSize`,
          class: "B",
          reason: expect.stringContaining("unavailable before"),
        },
      ],
    });
  });

  it("requires matching format and dialect for class-C source declarations", () => {
    const before = fixtureFeatures();
    before.parseability.declaredConflicts = { shiftReduce: 0 };
    delete before.parseability.notApplicable?.declaredConflicts;
    const after = structuredClone(before);
    after.parseability.declaredConflicts = { shiftReduce: 2 };
    const path = "/parseability/declaredConflicts/shiftReduce";
    expect(diffFeatures(before, after).changes).toContainEqual({
      path,
      before: 0,
      after: 2,
      kind: "changed",
    });
    after.source.dialect = "different";
    const diff = diffFeatures(before, after);
    expect(diff.changes.map((change) => change.path)).not.toContain(path);
    expect(diff).toMatchObject({
      notComparable: [{ path, class: "C", reason: expect.stringContaining("dialect") }],
    });
    after.source.format = "other";
    expect(diffFeatures(before, after)).toMatchObject({
      notComparable: [{ path, class: "C", reason: expect.stringContaining("format") }],
    });
  });

  it("honors notApplicable reasons instead of comparing retained numeric placeholders", () => {
    const before = fixtureFeatures();
    before.actions.totalActions = 0;
    before.actions.notApplicable = { totalActions: "actions are partial" };
    const after = structuredClone(before);
    after.actions.totalActions = 2;
    const diff = diffFeatures(before, after);

    expect(diff.changes).toEqual([]);
    expect(diff.regressions).toEqual([]);
    expect(diff).toMatchObject({
      notComparable: [
        {
          path: "/actions/totalActions",
          class: "C",
          reason: expect.stringContaining("actions are partial"),
        },
      ],
    });
    expect(renderFeatureDiffMarkdown(diff)).toContain("actions are partial");
    expect(JSON.parse(renderFeatureDiffJson(diff))).toMatchObject({
      changes: [],
      notComparable: [{ path: "/actions/totalActions", class: "C" }],
    });
  });

  it("gates effective derived capabilities independently from source capabilities", () => {
    const before = fixtureFeatures();
    before.parseability.context = concreteContext(before);
    const after = structuredClone(before);
    if (!after.parseability.ll1Conflicts || !after.parseability.context) {
      throw new Error("fixture needs derived CFG conflicts");
    }
    after.parseability.ll1Conflicts.total += 1;
    after.parseability.context.effectiveCapabilities.scannerless =
      !before.parseability.context.effectiveCapabilities.scannerless;

    expect(diffFeatures(before, after)).toMatchObject({
      regressions: [],
      notComparable: [
        {
          path: "/parseability/ll1Conflicts/total",
          class: "B",
          reason: expect.stringContaining("effective capabilities"),
        },
      ],
    });
  });

  it("does not compare metric definitions from different feature versions", () => {
    const before = fixtureFeatures();
    const after = structuredClone(before);
    after.featuresVersion = "0.9.0";
    after.size.rules += 1;
    const diff = diffFeatures(before, after);

    expect(diff.changes).toEqual([
      { path: "/featuresVersion", before: before.featuresVersion, after: "0.9.0", kind: "changed" },
    ]);
    expect(diff.regressions).toEqual([]);
    expect(diff).toMatchObject({
      notComparable: [
        { path: "/size/rules", class: "A", reason: expect.stringContaining("featuresVersion") },
      ],
    });
  });

  it("treats prototype-shaped rule names as ordinary added and removed rows", () => {
    const before = fixtureFeatures();
    const row = before.perRule[0];
    if (!row) throw new Error("fixture needs a rule");
    before.perRule = [
      { ...row, rule: "__proto__" },
      { ...row, rule: "constructor" },
    ];
    const after = structuredClone(before);
    after.perRule = [{ ...row, rule: "toString" }];

    expect(diffFeatures(before, after).changes).toEqual([
      { path: "/perRule/__proto__", before: before.perRule[0], after: undefined, kind: "removed" },
      {
        path: "/perRule/constructor",
        before: before.perRule[1],
        after: undefined,
        kind: "removed",
      },
      { path: "/perRule/toString", before: undefined, after: after.perRule[0], kind: "added" },
    ]);
  });

  it("explains newly available aggregate metrics without leaking an object numeric delta", () => {
    const before = fixtureFeatures();
    delete before.parseability.declaredConflicts;
    const after = structuredClone(before);
    after.parseability.declaredConflicts = { shiftReduce: 0, reduceReduce: 2 };
    delete after.parseability.notApplicable?.declaredConflicts;
    const diff = diffFeatures(before, after);

    expect(
      diff.changes.filter(({ path }) => !path.startsWith("/parseability/notApplicable/")),
    ).toEqual([]);
    expect(diff).toMatchObject({
      notComparable: [
        {
          path: "/parseability/declaredConflicts/reduceReduce",
          class: "C",
          reason: expect.stringContaining("metric is unavailable before"),
        },
        {
          path: "/parseability/declaredConflicts/shiftReduce",
          class: "C",
          reason: expect.stringContaining("metric is unavailable before"),
        },
      ],
    });
  });

  it("keeps source and derived gates separate for local rule metrics", () => {
    const before = fixtureFeatures();
    before.parseability.context = concreteContext(before);
    const after = structuredClone(before);
    const row = after.perRule[0];
    if (!row || row.firstSetSize === undefined) throw new Error("fixture needs CFG rule metrics");
    row.firstSetSize += 1;
    row.maxExpressionNestingDepth += 1;
    after.capabilities.ebnfSugar = !before.capabilities.ebnfSugar;
    const diff = diffFeatures(before, after);

    expect(diff.changes.map(({ path }) => path)).toContain(`/perRule/${row.rule}/firstSetSize`);
    expect(diff.changes.map(({ path }) => path)).not.toContain(
      `/perRule/${row.rule}/maxExpressionNestingDepth`,
    );
    expect(diff).toMatchObject({
      notComparable: [
        {
          path: `/perRule/${row.rule}/maxExpressionNestingDepth`,
          class: "B",
          reason: "source capabilities differ",
        },
      ],
    });
  });

  it("escapes rule names in Markdown comparison tables", () => {
    const before = fixtureFeatures();
    const row = before.perRule[0];
    if (!row) throw new Error("fixture needs a rule");
    before.perRule = [{ ...row, rule: "a|b" }];
    const after = structuredClone(before);
    const changed = after.perRule[0];
    if (!changed) throw new Error("fixture needs a rule");
    changed.alternatives += 1;

    expect(renderFeatureDiffMarkdown(diffFeatures(before, after))).toContain(
      "`/perRule/a\\|b/alternatives`",
    );
  });

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

  it("excludes shadowed global rule names from the dependency blast radius", () => {
    const grammar = (literal: string) =>
      parameterizedGrammar([
        { name: "p", params: ["X"], alternatives: [{ items: [{ kind: "symbol", name: "X" }] }] },
        {
          name: "start",
          alternatives: [
            { items: [{ kind: "symbol", name: "p", args: [{ kind: "terminal", literal: "a" }] }] },
          ],
        },
        { name: "X", alternatives: [{ items: [{ kind: "terminal", literal }] }] },
      ]);
    const features = fixtureFeatures();
    const diff = diffFeatures(features, structuredClone(features), {
      beforeIR: grammar("b"),
      afterIR: grammar("c"),
    });

    expect(diff.structural).toEqual({
      editDistance: 1,
      changedRules: ["X"],
      blastRadius: { forward: 1, reverse: 1, total: 1, rules: ["X"] },
    });
  });

  it("retains unbound rule references inside arguments of a formal symbol", () => {
    const grammar = (literal: string) =>
      parameterizedGrammar([
        {
          name: "p",
          params: ["F"],
          alternatives: [
            { items: [{ kind: "symbol", name: "F", args: [{ kind: "symbol", name: "value" }] }] },
          ],
        },
        {
          name: "start",
          alternatives: [
            { items: [{ kind: "symbol", name: "p", args: [{ kind: "terminal", literal: "a" }] }] },
          ],
        },
        { name: "F", alternatives: [{ items: [{ kind: "terminal", literal: "f" }] }] },
        { name: "value", alternatives: [{ items: [{ kind: "terminal", literal }] }] },
      ]);
    const features = fixtureFeatures();
    const diff = diffFeatures(features, structuredClone(features), {
      beforeIR: grammar("b"),
      afterIR: grammar("c"),
    });

    expect(diff.structural).toEqual({
      editDistance: 1,
      changedRules: ["value"],
      blastRadius: { forward: 1, reverse: 3, total: 3, rules: ["p", "start", "value"] },
    });
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
