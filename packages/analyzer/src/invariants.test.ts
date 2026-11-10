import {
  compareBytes,
  type Expr,
  type GrammarFeatures,
  type GrammarIR,
  IR_VERSION,
  type Rule,
  serializeCanonical,
  validateFeatures,
  validateIR,
} from "@gramin/core";
import { describe, expect, it } from "vitest";
import { analyzeGrammar } from "./analyze.js";

const grammar = (
  rules: Rule[],
  startSymbols = rules.slice(0, 1).map((rule) => rule.name),
): GrammarIR => ({
  irVersion: IR_VERSION,
  source: { format: "bnf", frontend: { id: "invariant-test", version: "0.1.0" } },
  capabilities: {
    orderedChoice: false,
    ebnfSugar: false,
    predicates: false,
    scannerless: false,
    precedenceTable: false,
    parameterizedRules: false,
    lexerRules: false,
  },
  startSymbols,
  terminals: [{ name: "T0" }, { name: "T1" }, { literal: "" }],
  externalSymbols: [],
  precedence: [],
  rules,
  diagnostics: [],
});
const rule = (name: string, ...alternatives: Expr[][]): Rule => ({
  name,
  alternatives: alternatives.map((items) => ({ items })),
});
const reference = (name: string): Expr => ({ kind: "symbol", name });
const terminal: Expr = { kind: "terminal", name: "T0" };
const empty: Expr = { kind: "terminal", literal: "" };
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const rounded = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000;

const generatedGrammar = (seed: number): GrammarIR => {
  let state = seed;
  const choose = (limit: number) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % limit;
  };
  const names = Array.from({ length: choose(9) }, (_, index) => `rule_${index}`);
  const rules = names.map((name) =>
    rule(
      name,
      ...Array.from({ length: choose(3) + 1 }, () =>
        Array.from({ length: choose(5) }, (): Expr => {
          const kind = choose(6);
          if (kind < 3) return reference(names[choose(names.length)] as string);
          if (kind === 3) return empty;
          return { kind: "terminal", name: `T${kind - 4}` };
        }),
      ),
    ),
  );
  return grammar(
    rules,
    names.filter(() => choose(3) === 0),
  );
};

const checkDistribution = (
  distribution: GrammarFeatures["parseability"]["firstSetSize"],
  values: { rule: string; value: number }[],
  label: string,
) => {
  expect(distribution, label).toBeDefined();
  const samples = values.map(({ value }) => value).sort((left, right) => left - right);
  expect(distribution?.average, label).toBe(rounded(sum(samples) / samples.length));
  expect(distribution?.maximum, label).toEqual(
    values.sort(
      (left, right) => right.value - left.value || compareBytes(left.rule, right.rule),
    )[0],
  );
  expect(distribution?.percentiles, label).toEqual({
    p50: samples[Math.ceil(samples.length * 0.5) - 1],
    p95: samples[Math.ceil(samples.length * 0.95) - 1],
  });
};

const checkInvariants = (ir: GrammarIR, label: string) => {
  expect(validateIR(ir), label).toMatchObject({ ok: true });
  const features = analyzeGrammar(ir);
  expect(validateFeatures(features), label).toMatchObject({ ok: true });
  const { size, structure, parseability, perRule } = features;
  const names = ir.rules.map(({ name }) => name).sort(compareBytes);
  expect(
    perRule.map(({ rule }) => rule),
    label,
  ).toEqual(names);
  expect(size.rules, label).toBe(names.length);
  expect(size.nonterminals, label).toBe(names.length);
  expect(sum(perRule.map(({ alternatives }) => alternatives)), label).toBe(size.alternatives);

  const lengths = ir.rules.flatMap(({ alternatives }) =>
    alternatives.map(
      ({ items }) => items.filter((item) => item.kind !== "terminal" || item.literal !== "").length,
    ),
  );
  expect(size.alternatives, label).toBe(lengths.length);
  expect(sum(perRule.map(({ rhsItems }) => rhsItems)), label).toBe(sum(lengths));
  expect(size.emptyAlternatives, label).toBe(lengths.filter((length) => length === 0).length);
  expect(size.maxRhsLength.value, label).toBe(Math.max(0, ...lengths));
  expect(size.maxAltPerRule.value, label).toBe(
    Math.max(0, ...perRule.map((row) => row.alternatives)),
  );
  expect(size.avgAltPerRule, label).toBe(
    names.length === 0 ? 0 : rounded(lengths.length / names.length),
  );
  expect(size.avgRhsLength, label).toBe(
    lengths.length === 0 ? 0 : rounded(sum(lengths) / lengths.length),
  );

  for (const row of perRule) {
    const source = ir.rules.find(({ name }) => name === row.rule) as Rule;
    const localLengths = source.alternatives.map(
      ({ items }) => items.filter((item) => item.kind !== "terminal" || item.literal !== "").length,
    );
    expect(row.alternatives, label).toBe(source.alternatives.length);
    expect(row.rhsItems, label).toBe(sum(localLengths));
    expect(row.maxRhsItems, label).toBe(Math.max(...localLengths));
    const references = [
      ...new Set(
        source.alternatives.flatMap(({ items }) =>
          items.flatMap((item) => (item.kind === "symbol" ? [item.name] : [])),
        ),
      ),
    ].sort(compareBytes);
    expect(row.references, label).toEqual(references);
    expect(row.fanOut, label).toBe(row.references.length);
    expect(row.fanIn, label).toBe(row.referencedBy.length);
    expect(
      row.references.every((target) => names.includes(target)),
      label,
    ).toBe(true);
    for (const target of perRule) {
      expect(row.references.includes(target.rule), label).toBe(
        target.referencedBy.includes(row.rule),
      );
    }
    expect(row.firstSetSize, label).toBeDefined();
    expect(row.followSetSize, label).toBeDefined();
    expect(row.ll1Conflicts, label).toBeDefined();
    expect(row.ll1Conflicts?.total, label).toBe(
      (row.ll1Conflicts?.firstFirst as number) + (row.ll1Conflicts?.firstFollow as number),
    );
    const pairs = (row.alternatives * (row.alternatives - 1)) / 2;
    expect(row.ll1Conflicts?.firstFirst, label).toBeLessThanOrEqual(pairs);
    expect(row.ll1Conflicts?.firstFollow, label).toBeLessThanOrEqual(pairs);
  }
  expect(sum(perRule.map(({ fanIn }) => fanIn)), label).toBe(
    sum(perRule.map(({ fanOut }) => fanOut)),
  );

  const reachable = [
    ...new Set(structure.startSymbolReachability.entries.flatMap(({ rules }) => rules)),
  ].sort(compareBytes);
  expect(structure.reachableRules, label).toBe(reachable.length);
  expect([...reachable, ...structure.unreachableSymbols].sort(compareBytes), label).toEqual(names);
  expect(
    reachable.some((name) => structure.unreachableSymbols.includes(name)),
    label,
  ).toBe(false);
  expect(
    structure.startSymbolReachability.entries.map(({ symbol }) => symbol),
    label,
  ).toEqual([...new Set(ir.startSymbols)].sort(compareBytes));
  for (const row of perRule) {
    expect(row.reachableFromStarts, label).toEqual(
      structure.startSymbolReachability.entries
        .filter(({ rules }) => rules.includes(row.rule))
        .map(({ symbol }) => symbol),
    );
  }

  const finite = structure.shortestDerivation;
  const unknown = structure.shortestDerivationUnknown;
  expect([...finite.map(({ rule }) => rule), ...unknown].sort(compareBytes), label).toEqual(names);
  expect(finite.filter(({ length }) => length === 0).length, label).toBe(structure.nullableRules);
  for (const row of perRule) {
    expect(row.shortestDerivation, label).toBe(
      finite.find(({ rule }) => rule === row.rule)?.length,
    );
    expect(unknown.includes(row.rule), label).toBe(row.shortestDerivation === undefined);
    if (row.shortestDerivation === undefined) continue;
    expect(Number.isInteger(row.shortestDerivation), label).toBe(true);
    expect(row.shortestDerivation, label).toBeGreaterThanOrEqual(0);
  }
  if (names.length === 0) {
    expect(parseability.firstSetSize, label).toBeUndefined();
    expect(parseability.followSetSize, label).toBeUndefined();
    expect(parseability.notApplicable?.firstSetSize, label).toBeDefined();
    expect(parseability.notApplicable?.followSetSize, label).toBeDefined();
  } else {
    checkDistribution(
      parseability.firstSetSize,
      perRule.map((row) => ({ rule: row.rule, value: row.firstSetSize as number })),
      label,
    );
    checkDistribution(
      parseability.followSetSize,
      perRule.map((row) => ({ rule: row.rule, value: row.followSetSize as number })),
      label,
    );
  }
  for (const component of ["firstFirst", "firstFollow", "total"] as const) {
    expect(parseability.ll1Conflicts?.[component], label).toBe(
      sum(perRule.map((row) => row.ll1Conflicts?.[component] as number)),
    );
  }
  expect(parseability.unitRules, label).toBe(sum(perRule.map(({ unitRules }) => unitRules)));
  expect(serializeCanonical(features), label).toBe(serializeCanonical(analyzeGrammar(ir)));
};

describe("canonical CFG metric invariants", () => {
  it.each([
    ["empty grammar", grammar([])],
    ["no starts", grammar([rule("a", [terminal])], [])],
    ["multiple starts", grammar([rule("a", [reference("b")]), rule("b", [])], ["b", "a"])],
    ["epsilon and empty literal", grammar([rule("a", [], [empty])])],
    ["self-loop", grammar([rule("a", [reference("a")])])],
    ["mutual cycle", grammar([rule("a", [reference("b")]), rule("b", [reference("a")])])],
    ["unreachable rule", grammar([rule("a", [terminal]), rule("b", [])])],
    ["repeated references", grammar([rule("a", [reference("b"), reference("b")]), rule("b", [])])],
  ])("preserves invariants for %s", (label, ir) => {
    checkInvariants(ir, label);
  });

  it("preserves canonical CFG invariants across fixed seeds", () => {
    for (let seed = 0; seed < 128; seed += 1) {
      checkInvariants(generatedGrammar(seed), `seed=${seed}`);
    }
  });
});
