import { type Expr, type GrammarIR, type Rule, serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { expandParameterizedRules } from "./parameter-expansion.js";
import { parseabilityAnalysis } from "./parseability.js";

const terminal = (name: string): Expr => ({ kind: "terminal", name });
const symbol = (name: string, ...args: Expr[]): Expr =>
  args.length === 0 ? { kind: "symbol", name } : { kind: "symbol", name, args };
const rule = (name: string, alternatives: Expr[][], params?: string[]): Rule => ({
  name,
  alternatives: alternatives.map((items) => ({ items })),
  ...(params === undefined ? {} : { params }),
});
const grammar = (rules: Rule[], overrides: Partial<GrammarIR> = {}): GrammarIR => ({
  irVersion: "1.3.0",
  source: { format: "test", frontend: { id: "test", version: "1.0.0" } },
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
  terminals: [{ name: "A" }, { name: "B" }],
  externalSymbols: [],
  precedence: [],
  diagnostics: [],
  rules,
  ...overrides,
});
const expanded = (ir: GrammarIR, options?: Parameters<typeof expandParameterizedRules>[1]) => {
  const result = expandParameterizedRules(ir, options);
  expect(result.ok, result.ok ? undefined : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(validateIR(result.ir)).toMatchObject({ ok: true });
  return result;
};
const failure = (
  ir: GrammarIR,
  prefix: string,
  options?: Parameters<typeof expandParameterizedRules>[1],
) => {
  const result = expandParameterizedRules(ir, options);
  expect(result).toMatchObject({ ok: false, reason: expect.stringContaining(prefix) });
  expect(result).not.toHaveProperty("ir");
  return result;
};

describe("expandParameterizedRules", () => {
  it("matches a hand-written nullable concrete grammar exactly", () => {
    const input = grammar([
      rule("start", [[symbol("optional", terminal("A")), terminal("B")]]),
      rule("optional", [[symbol("X")], []], ["X"]),
      rule("unreachable", [[terminal("A")]]),
    ]);
    const before = serializeCanonical(input);
    const result = expanded(input);
    expect(result.instanceCount).toBe(1);
    expect(result.helperCount).toBe(0);
    expect(result.sourceRuleNames).toEqual(["start", "unreachable"]);
    expect(result.omittedTemplateNames).toEqual(["optional"]);
    const instance = result.ir.rules.find(({ name }) => !result.sourceRuleNames.includes(name));
    expect(instance).toBeDefined();
    if (!instance) throw new Error("missing instance");
    const concrete = grammar(
      [
        rule("start", [[symbol(instance.name), terminal("B")]]),
        rule(instance.name, [[terminal("A")], []]),
        rule("unreachable", [[terminal("A")]]),
      ],
      { capabilities: { ...input.capabilities, parameterizedRules: false } },
    );
    const measured = parseabilityAnalysis(result.ir, { lr: true });
    expect(measured).toEqual(parseabilityAnalysis(concrete, { lr: true }));
    expect(measured.features).toMatchObject({
      firstSetSize: { average: 1.3333, maximum: { value: 2, rule: "start" } },
      ll1Conflicts: { firstFirst: 0, firstFollow: 0, total: 0 },
      slr: expect.any(Object),
    });
    expect(serializeCanonical(input)).toBe(before);
  });

  it("substitutes nested arguments simultaneously without capturing global names", () => {
    const input = grammar([
      rule("start", [
        [
          symbol("pair", symbol("Y"), terminal("B")),
          symbol("wrap", symbol("optional", terminal("A"))),
        ],
      ]),
      rule("Y", [[terminal("A")]]),
      rule("pair", [[symbol("X"), symbol("Y")]], ["X", "Y"]),
      rule("wrap", [[symbol("X")]], ["X"]),
      rule("optional", [[symbol("X")], []], ["X"]),
    ]);
    const result = expanded(input);
    expect(result.instanceCount).toBe(3);
    expect(
      result.ir.rules.some(({ alternatives }) =>
        alternatives.some(
          ({ items }) =>
            serializeCanonical(items) === serializeCanonical([symbol("Y"), terminal("B")]),
        ),
      ),
    ).toBe(true);
    expect(parseabilityAnalysis(result.ir).perRule.get("start")).toMatchObject({ firstSetSize: 1 });
  });

  it("lets formals shadow global definitions and resolves all zero-arity roots", () => {
    const result = expanded(
      grammar([
        rule("start", [[symbol("identity", terminal("A"))]]),
        rule("identity", [[symbol("X")]], ["X"]),
        rule("X", [[terminal("B")]]),
        rule("unused", [[symbol("identity", terminal("B"))]]),
        rule("uncalled", [[symbol("missing")]], ["X"]),
      ]),
    );
    expect(result.instanceCount).toBe(2);
    expect(result.sourceRuleNames).toEqual(["X", "start", "unused"]);
    expect(parseabilityAnalysis(result.ir).perRule.get("start")).toMatchObject({ firstSetSize: 1 });
  });

  it("memoizes repeated, direct-recursive, and mutually recursive instances", () => {
    const result = expanded(
      grammar([
        rule("start", [[symbol("p", terminal("A")), symbol("p", terminal("A"))]]),
        rule("p", [[symbol("X")], [symbol("p", symbol("X"))], [symbol("q", symbol("X"))]], ["X"]),
        rule("q", [[symbol("p", symbol("Y"))]], ["Y"]),
      ]),
    );
    expect(result.instanceCount).toBe(2);
    expect(result.ir.rules).toHaveLength(3);
    expect(parseabilityAnalysis(result.ir, { lr: true }).features.slr).toBeDefined();
  });

  it("normalizes empty argument lists and strips recognition-irrelevant metadata from keys", () => {
    const result = expanded(
      grammar([
        rule("start", [
          [
            { kind: "symbol", name: "p", args: [symbol("root")], label: "first" },
            symbol("p", { kind: "symbol", name: "root", args: [], label: "second" }),
            symbol("p", { kind: "midRuleAction", codeLength: 5 }),
            symbol("p", { kind: "midRuleAction", codeLength: 99 }),
          ],
        ]),
        rule("root", [[terminal("A")]], []),
        rule("p", [[symbol("X")]], ["X"]),
      ]),
    );
    expect(result.instanceCount).toBe(2);
  });

  it("flattens sequences introduced by substitution before comparing instance keys", () => {
    const result = expanded(
      grammar([
        rule("start", [
          [
            symbol("p", { kind: "seq", items: [terminal("A"), terminal("B")] }),
            symbol("q", { kind: "seq", items: [terminal("A"), terminal("B"), terminal("C")] }),
          ],
        ]),
        rule("p", [[symbol("q", { kind: "seq", items: [symbol("X"), terminal("C")] })]], ["X"]),
        rule("q", [[symbol("Y")]], ["Y"]),
      ]),
    );
    expect(result.instanceCount).toBe(2);
  });

  it("lowers opt, star, plus, nested choice, groups, and sequences to finite BNF", () => {
    const input = grammar(
      [
        rule("start", [
          [
            symbol("p", {
              kind: "group",
              expr: {
                kind: "choice",
                ordered: false,
                alts: [
                  { kind: "seq", items: [terminal("A"), { kind: "opt", expr: terminal("B") }] },
                  { kind: "seq", items: [] },
                ],
              },
            }),
          ],
        ]),
        rule(
          "p",
          [
            [
              { kind: "star", expr: symbol("X") },
              { kind: "plus", expr: terminal("A") },
            ],
          ],
          ["X"],
        ),
      ],
      { capabilities: { ...grammar([]).capabilities, ebnfSugar: true } },
    );
    const result = expanded(input);
    expect(result.helperCount).toBe(4);
    expect(result.ir.capabilities).toMatchObject({ ebnfSugar: false, parameterizedRules: false });
    expect(
      result.ir.rules
        .flatMap(({ alternatives }) => alternatives.flatMap(({ items }) => items))
        .every(({ kind }) => kind === "symbol" || kind === "terminal"),
    ).toBe(true);
    const rules = new Map(result.ir.rules.map((value) => [value.name, value]));
    const target = (from: Rule, itemIndex: number): Rule => {
      const item = from.alternatives[0]?.items[itemIndex];
      if (item?.kind !== "symbol") throw new Error("expected rule reference");
      const found = rules.get(item.name);
      if (!found) throw new Error("missing referenced rule");
      return found;
    };
    const start = rules.get("start");
    if (!start) throw new Error("missing start");
    const instance = target(start, 0);
    const star = target(instance, 0);
    const plus = target(instance, 1);
    expect(star.alternatives[0]?.items).toEqual([]);
    const repeated = star.alternatives[1]?.items;
    expect(repeated?.[1]).toEqual(symbol(star.name));
    if (repeated?.[0]?.kind !== "symbol") throw new Error("missing repeated choice");
    const choice = rules.get(repeated[0].name);
    if (!choice) throw new Error("missing choice");
    const optional = target(choice, 1);
    expect(choice.alternatives).toEqual([
      { items: [terminal("A"), symbol(optional.name)] },
      { items: [] },
    ]);
    expect(optional.alternatives).toEqual([{ items: [terminal("B")] }, { items: [] }]);
    expect(plus.alternatives).toEqual([
      { items: [terminal("A")] },
      { items: [terminal("A"), symbol(plus.name)] },
    ]);
    expect(parseabilityAnalysis(result.ir, { lr: true }).features.slr).toBeDefined();
  });

  it("uses supplied definitions only when no local definition exists", () => {
    const input = grammar(
      [
        rule("start", [[symbol("p", terminal("A")), symbol("library")]]),
        rule("p", [[symbol("X")]], ["X"]),
      ],
      { externalSymbols: [{ name: "library", origin: "stdlib", kind: "rule" }] },
    );
    const result = expanded(input, {
      definitions: [
        rule("p", [[symbol("missing")]], ["X", "Y"]),
        rule("library", [[terminal("B")]]),
      ],
    });
    expect(result.instanceCount).toBe(2);
    expect(result.ir.rules.some(({ name }) => name === "library")).toBe(false);
  });

  it("retains declared external terminals including error as actual terminals", () => {
    const result = expanded(
      grammar(
        [
          rule("start", [[symbol("identity", symbol("error")), symbol("A")]]),
          rule("identity", [[symbol("X")]], ["X"]),
        ],
        { externalSymbols: [{ name: "error", origin: "builtin", kind: "terminal" }] },
      ),
    );
    expect(
      result.ir.rules.some(({ alternatives }) =>
        alternatives.some(({ items }) =>
          items.some((item) => item.kind === "terminal" && item.name === "error"),
        ),
      ),
    ).toBe(true);
    expect(parseabilityAnalysis(result.ir, { lr: true }).features.slr).toBeDefined();
  });

  it.each([
    [
      "missing body",
      grammar([rule("start", [[symbol("list", terminal("A"))]])], {
        externalSymbols: [{ name: "list", origin: "stdlib", kind: "rule" }],
      }),
      "parameter-definition-unavailable",
    ],
    [
      "unknown external",
      grammar([rule("start", [[symbol("external")]])], {
        externalSymbols: [{ name: "external", origin: "test", kind: "unknown" }],
      }),
      "parameter-definition-unavailable",
    ],
    [
      "unresolved symbol",
      grammar([rule("start", [[symbol("missing")]])]),
      "parameter-symbol-unresolved",
    ],
    [
      "missing arguments",
      grammar([rule("start", [[symbol("p")]]), rule("p", [[symbol("X")]], ["X"])]),
      "parameter-arity-mismatch",
    ],
    [
      "extra arguments",
      grammar([rule("start", [[symbol("p", terminal("A"))]]), rule("p", [[]])]),
      "parameter-arity-mismatch",
    ],
    [
      "parameterized start",
      grammar([rule("start", [[symbol("X")]], ["X"])]),
      "parameter-arity-mismatch",
    ],
    [
      "higher-order call",
      grammar([
        rule("start", [[symbol("p", terminal("A"))]]),
        rule("p", [[symbol("X", terminal("B"))]], ["X"]),
      ]),
      "parameter-binding-unsupported",
    ],
    [
      "duplicate formal",
      grammar([
        rule("start", [[symbol("p", terminal("A"), terminal("B"))]]),
        rule("p", [[symbol("X")]], ["X", "X"]),
      ]),
      "parameter-binding-unsupported",
    ],
    [
      "incompatible declarations",
      grammar([rule("start", [[]]), rule("p", [[]], ["X"]), rule("p", [[]], ["Y"])]),
      "parameter-binding-unsupported",
    ],
    [
      "ordered alternatives",
      grammar([{ ...rule("start", [[]]), orderedAlternatives: true }]),
      "orderedChoice",
    ],
    [
      "ordered choice",
      grammar([
        rule("start", [[symbol("p", { kind: "choice", ordered: true, alts: [terminal("A")] })]]),
        rule("p", [[symbol("X")]], ["X"]),
      ]),
      "orderedChoice",
    ],
    [
      "predicate",
      grammar([rule("start", [[{ kind: "predicate", positive: true, expr: terminal("A") }]])]),
      "predicates",
    ],
  ])("rejects %s without returning a partial grammar", (_name, input, prefix) => {
    failure(input, prefix);
  });

  it("gives growing argument cycles a deterministic bounded failure", () => {
    const input = grammar([
      rule("start", [[symbol("p", terminal("A"))]]),
      rule("p", [[symbol("p", symbol("box", symbol("X")))]], ["X"]),
      rule("box", [[symbol("X")]], ["X"]),
    ]);
    const result = failure(input, "maxInstances", { maxInstances: 4 });
    expect(expandParameterizedRules(input, { maxInstances: 4 })).toEqual(result);
    failure(input, "maxDepth", { maxDepth: 5 });
  });

  it("accepts exact instance and work budgets and rejects one less", () => {
    const input = grammar([
      rule("start", [[symbol("p", { kind: "opt", expr: terminal("A") })]]),
      rule("p", [[symbol("X")]], ["X"]),
    ]);
    const result = expanded(input);
    expanded(input, {
      maxInstances: result.instanceCount + result.helperCount,
      maxNodeVisits: result.nodeVisits,
    });
    failure(input, "maxInstances", { maxInstances: result.instanceCount + result.helperCount - 1 });
    failure(input, "maxNodeVisits", { maxNodeVisits: result.nodeVisits - 1 });
  });

  it("bounds large empty template bodies even when they contain no expression nodes", () => {
    const input = grammar([
      rule("start", [[symbol("p", terminal("A"))]]),
      rule(
        "p",
        Array.from({ length: 1_000 }, () => []),
        ["X"],
      ),
    ]);
    failure(input, "maxNodeVisits=4", { maxNodeVisits: 4, maxInstances: 1, maxKeyBytes: 1_000 });
    const result = expanded(input);
    const instance = result.ir.rules.find(({ name }) => name !== "start");
    expect(instance?.alternatives).toHaveLength(1_000);
    expanded(input, { maxNodeVisits: result.nodeVisits });
    failure(input, "maxNodeVisits", { maxNodeVisits: result.nodeVisits - 1 });
  });

  it("charges each instance's empty alternatives instead of amplifying an already indexed body for free", () => {
    const template = rule(
      "p",
      Array.from({ length: 1_000 }, () => []),
      ["X"],
    );
    const one = grammar([rule("start", [[symbol("p", terminal("A"))]]), template]);
    const two = grammar([
      rule("start", [[symbol("p", terminal("A")), symbol("p", terminal("B"))]]),
      template,
    ]);
    const single = expanded(one);
    const multiple = expanded(two);
    expect(multiple.nodeVisits - single.nodeVisits).toBeGreaterThanOrEqual(1_001);
    expect(
      multiple.ir.rules
        .filter(({ name }) => name !== "start")
        .map(({ alternatives }) => alternatives.length),
    ).toEqual([1_000, 1_000]);
    failure(two, "maxNodeVisits", { maxNodeVisits: single.nodeVisits });
  });

  it("budgets definition indexing before copying a huge unused empty template body", () => {
    const input = grammar([
      rule("start", [[]]),
      rule(
        "unused",
        Array.from({ length: 1_000 }, () => []),
        ["X"],
      ),
    ]);
    failure(input, "maxNodeVisits=4", { maxNodeVisits: 4 });
  });

  it("charges generated helper rule and empty-alternative work at the exact boundary", () => {
    const input = grammar([
      rule("start", [[symbol("p", terminal("A"))]]),
      rule("p", [[{ kind: "opt", expr: { kind: "seq", items: [] } }]], ["X"]),
    ]);
    const result = expanded(input);
    expect(result.nodeVisits).toBe(20);
    expanded(input, { maxNodeVisits: 20 });
    failure(input, "maxNodeVisits=19", { maxNodeVisits: 19 });
  });

  it("accepts the exact cumulative UTF-8 identity/name byte budget and rejects one byte less", () => {
    const literal = '🙂\\"\n'.repeat(1_000);
    const input = grammar([
      rule("start", [
        [symbol("p", { kind: "terminal", literal }), symbol("p", { kind: "terminal", literal })],
      ]),
      rule("p", [[{ kind: "opt", expr: symbol("X") }]], ["X"]),
    ]);
    const result = expanded(input);
    expect(typeof result.keyBytes).toBe("number");
    expanded(input, { maxKeyBytes: result.keyBytes });
    const outcome = failure(input, "maxKeyBytes", { maxKeyBytes: result.keyBytes - 1 });
    expect(expandParameterizedRules(input, { maxKeyBytes: result.keyBytes - 1 })).toEqual(outcome);
  });

  it("charges canonical identities on memo hits and charges provided namespace and generated names", () => {
    const controls = Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)).join("");
    const literal = `${"a".repeat(8_192)}${controls}"\\é\u007f\u07ff\u0800\ud800x\udc00🙂`;
    const argument: Expr = { kind: "terminal", literal };
    const once = grammar([rule("start", [[symbol("library", argument)]])]);
    const twice = grammar([
      rule("start", [[symbol("library", argument), symbol("library", argument)]]),
    ]);
    const definitions = [rule("library", [[symbol("X")]], ["X"])];
    const one = expanded(once, { definitions });
    const two = expanded(twice, { definitions });
    const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
    const identity = JSON.stringify(["provided", "library", [["terminal", null, literal]]]);
    const generated = one.ir.rules.find(({ name }) => name !== "start");
    if (!generated) throw new Error("missing generated instance");
    expect(one.keyBytes).toBe(
      bytes(JSON.stringify(["source", "start"])) + bytes(identity) + bytes(generated.name),
    );
    expect(two.instanceCount).toBe(1);
    expect(two.keyBytes - one.keyBytes).toBe(bytes(identity));
    failure(twice, "maxKeyBytes", { definitions, maxKeyBytes: one.keyBytes });
  });

  it("charges helper identities including escaped owner/path strings and their full generated names", () => {
    const input = grammar([rule("start", [[{ kind: "opt", expr: terminal("A") }]])]);
    const result = expanded(input);
    const generated = result.ir.rules.find(({ name }) => name !== "start");
    if (!generated) throw new Error("missing generated helper");
    const owner = JSON.stringify(["source", "start"]);
    const identity = JSON.stringify([owner, "0/0"]);
    const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
    expect(result.keyBytes).toBe(bytes(owner) + bytes(identity) + bytes(generated.name));
  });

  it("bounds growing keys with large literals before expression-node and depth limits", () => {
    const input = grammar([
      rule("start", [[symbol("p", { kind: "terminal", literal: "x".repeat(65_536) })]]),
      rule("p", [[symbol("p", symbol("box", symbol("X")))]], ["X"]),
      rule("box", [[symbol("X")]], ["X"]),
    ]);
    const result = failure(input, "maxKeyBytes=8388608");
    expect(expandParameterizedRules(input)).toEqual(result);
  });

  it("keeps plain large source leaves as input string references without encoding them as keys", () => {
    const input = grammar([
      rule("start", [[{ kind: "terminal", literal: "x".repeat(1_048_576) }]]),
    ]);
    const maxKeyBytes = new TextEncoder().encode(JSON.stringify(["source", "start"])).byteLength;
    const result = expanded(input, { maxKeyBytes });
    expect(result.keyBytes).toBe(maxKeyBytes);
    expect(result.ir.rules[0]?.alternatives[0]?.items[0]).toEqual(
      input.rules[0]?.alternatives[0]?.items[0],
    );
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid deterministic limits (%s)",
    (maxInstances) => {
      failure(grammar([rule("start", [[]])]), "maxInstances", { maxInstances });
    },
  );

  it("checks the exact expression depth boundary before recursing", () => {
    const input = grammar([
      rule("start", [[symbol("p", { kind: "opt", expr: terminal("A") })]]),
      rule("p", [[symbol("X")]], ["X"]),
    ]);
    expanded(input, { maxDepth: 3 });
    failure(input, "maxDepth", { maxDepth: 2 });
  });

  it("keeps generated identities injective and avoids generated-looking user names", () => {
    const collision = `@gramin:parameter:${":".repeat(4_096)}user`;
    const input = grammar([
      rule("start", [
        [
          symbol("p", terminal("A,B")),
          symbol("p", terminal("A"), terminal("B")),
          symbol(collision),
        ],
      ]),
      rule("p", [[symbol("X")]], ["X"]),
      rule(collision, [[terminal("B")]]),
    ]);
    // Arity is part of the definition, so use distinct same-arity trees for the delimiter case.
    input.rules[0] = rule("start", [
      [
        symbol("p", { kind: "seq", items: [terminal("A,B"), terminal("C")] }),
        symbol("p", { kind: "seq", items: [terminal("A"), terminal("B,C")] }),
        symbol(collision),
      ],
    ]);
    const result = expanded(input);
    expect(result.instanceCount).toBe(2);
    expect(new Set(result.ir.rules.map(({ name }) => name)).size).toBe(result.ir.rules.length);
    expect(
      result.ir.rules
        .filter(({ name }) => !result.sourceRuleNames.includes(name))
        .every(({ name }) => name.startsWith(`@gramin:parameter:${":".repeat(4_097)}instance:`)),
    ).toBe(true);
    expect(expandParameterizedRules(input)).toEqual(result);
    expect(serializeCanonical(expandParameterizedRules(input))).toBe(serializeCanonical(result));
  });
});
