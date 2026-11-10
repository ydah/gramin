import { readFileSync } from "node:fs";
import { serializeCanonical, validateIR } from "@gramin/core";
import { describe, expect, it } from "vitest";
import { lexYacc, lowerYaccAst, parseYaccAst, yaccFrontend } from "./index.js";

describe("global conflict expectations", () => {
  it.each(["yacc", "bison", "lrama"])("retains explicit zero and two in %s", (dialect) => {
    const source = "%expect 0\n%expect-rr 2\n%%\nentry: 'x';\n%%";
    const parsed = parseYaccAst(source, dialect);
    const result = yaccFrontend.parse([{ name: "expect.y", content: source }], { dialect });
    expect(parsed.ast.expectedConflicts).toEqual({ shiftReduce: 0, reduceReduce: 2 });
    expect(result.ir?.expectedConflicts).toEqual({ shiftReduce: 0, reduceReduce: 2 });
    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(JSON.parse(serializeCanonical(result.ir)).expectedConflicts).toEqual({
      shiftReduce: 0,
      reduceReduce: 2,
    });
  });

  it.each([
    ["%expect 12", { shiftReduce: 12 }],
    ["%expect-rr 0", { reduceReduce: 0 }],
    ["%expect 0;", { shiftReduce: 0 }],
    ["%expect-rr 2;", { reduceReduce: 2 }],
    ["%expect 9007199254740991", { shiftReduce: Number.MAX_SAFE_INTEGER }],
  ])("captures a single declaration %s", (declaration, expected) => {
    const result = yaccFrontend.parse(
      [{ name: "expect.y", content: `${declaration}\n%%\nentry: 'x';` }],
      {},
    );
    expect(result.ir?.expectedConflicts).toEqual(expected);
    expect(result.diagnostics).toEqual([]);
  });

  it.each(["", "-1", "+1", "1.5", "9007199254740992", "1 2", "one", "'2'"])(
    "rejects an invalid value %j while retaining the other kind",
    (value) => {
      const result = yaccFrontend.parse(
        [{ name: "expect.y", content: `%expect ${value}\n%expect-rr 2\n%%\nentry: 'x';` }],
        {},
      );
      expect(result.ir?.expectedConflicts).toEqual({ reduceReduce: 2 });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "YACC103_INVALID_CONFLICT_EXPECTATION",
          severity: "error",
        }),
      );
      expect(validateIR(result.ir).ok).toBe(true);
      expect(result.ir?.rules.map((rule) => rule.name)).toEqual(["entry"]);
    },
  );

  it.each([
    "%expect 1\n%expect 1",
    "%expect 1\n%expect 2\n%expect 3",
    "%expect -1\n%expect 2",
    "%expect 1\n%expect -1",
  ])("omits a duplicated kind permanently: %s", (declarations) => {
    const result = yaccFrontend.parse(
      [{ name: "expect.y", content: `${declarations}\n%expect-rr 2\n%%\nentry: 'x';` }],
      {},
    );
    expect(result.ir?.expectedConflicts).toEqual({ reduceReduce: 2 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "YACC104_DUPLICATE_CONFLICT_EXPECTATION",
        severity: "error",
      }),
    );
  });

  it("does not emit an empty object when every declaration is invalid", () => {
    const result = yaccFrontend.parse(
      [{ name: "expect.y", content: "%expect -1\n%expect-rr 1.5\n%%\nentry: 'x';" }],
      {},
    );
    expect(result.ir?.expectedConflicts).toBeUndefined();
    expect(validateIR(result.ir).ok).toBe(true);
  });

  it("keeps rule-local annotations out of global declarations and preserves following rules", () => {
    const result = yaccFrontend.parse(
      [
        {
          name: "expect.y",
          content:
            "%rule template(X): X %expect 1;\n%%\nentry: 'x' %expect 0 %expect-rr 2;\nnext: 'y';",
        },
      ],
      {},
    );
    expect(result.ir?.expectedConflicts).toBeUndefined();
    expect(result.ir?.rules.map((rule) => rule.name)).toEqual(["template", "entry", "next"]);
    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.code === "YACC206_UNKNOWN_RULE_DIRECTIVE",
      ),
    ).toHaveLength(3);
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(false);
  });

  it("leaves undeclared expectations absent", () => {
    const result = yaccFrontend.parse([{ name: "expect.y", content: "%%\nentry: 'x';" }], {});
    expect(result.ir?.expectedConflicts).toBeUndefined();
  });
});

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

const parseFixture = (name: string) => yaccFrontend.parse([{ name, content: fixture(name) }], {});

describe("yacc-family lexer", () => {
  it("keeps braces and section markers inside opaque blocks synchronized", () => {
    const result = lexYacc(fixture("adversarial-actions.y"));
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.tokens.filter((token) => token.kind === "section")).toHaveLength(1);
    expect(result.tokens.filter((token) => token.kind === "action")).toHaveLength(3);
  });

  it("warns about raw strings and retains later rules", () => {
    const result = parseFixture("raw-string.y");
    expect(result.ir?.rules.map((rule) => rule.name)).toEqual(["first", "second"]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "YACC003_SUSPICIOUS_RAW_STRING",
    );
  });

  it("recovers an unclosed action at the next rule boundary", () => {
    const result = parseFixture("unclosed-action.y");
    expect(result.ir?.rules.map((rule) => rule.name)).toEqual(["broken", "valid"]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "YACC001_UNCLOSED_ACTION",
    );
  });
});

describe("yacc-family parser and lowering", () => {
  it.each([
    "after-shift",
    "before-reduce",
    "after-reduce",
    "after-shift-error-token",
    "after-pop-stack",
  ])("ignores the opaque %s hook and retains following grammar", (directive) => {
    const source = `%${directive} {
  #define HOOK_PERCENT_PAIR %%
  if (value % 2) { hook("} %%"); }
  /* } %% */
}
%token TOKEN
%%
entry: TOKEN ;
%%
`;
    const result = yaccFrontend.parse([{ name: "hooks.y", content: source }], {});

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "YACC100_IGNORED_DIRECTIVE", severity: "info" }),
    ]);
    expect(result.ir?.rules.map((rule) => rule.name)).toEqual(["entry"]);
    expect(result.ir?.terminals).toEqual([expect.objectContaining({ name: "TOKEN" })]);
    expect(lexYacc(source).tokens.filter((token) => token.kind === "action")).toHaveLength(1);
  });

  it("rejects excessive parameter nesting before recursive lowering", () => {
    const nested = `%%\nstart: f(${"f(".repeat(2_000)}TOKEN${")".repeat(2_000)});\n%%\n`;
    const result = yaccFrontend.parse([{ name: "deep.y", content: nested }], {
      maxNestingDepth: 5_000,
    });

    expect(result.ir).toBeNull();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "YACC005_NESTING_TOO_DEEP", severity: "error" }),
      ]),
    );
  });

  it.each([
    "calc.y",
    "empty.y",
    "indirect-recursion.y",
    "alias.y",
    "precedence-override.y",
    "adversarial-actions.y",
    "raw-string.y",
    "bison-named-references.y",
    "lrama.y",
    "json.y",
  ])("produces canonical IR for %s", (name) => {
    const result = parseFixture(name);
    expect(result.ir).not.toBeNull();
    expect(validateIR(result.ir).ok).toBe(true);
  });

  it("resolves a literal alias to the declared named terminal", () => {
    const result = parseFixture("alias.y");
    expect(result.ir?.terminals).toHaveLength(1);
    expect(result.ir?.terminals[0]).toMatchObject({ name: "OPEN", literal: "begin" });
    expect(result.ir?.rules[0]?.alternatives[0]?.items).toEqual([
      { kind: "terminal", name: "OPEN", literal: "begin" },
      { kind: "terminal", name: "OPEN", literal: "begin" },
    ]);
  });

  it("keeps later rules after a malformed rule", () => {
    const result = parseFixture("syntax-error-recovery.y");
    expect(result.ir?.rules.map((rule) => rule.name)).toContain("valid");
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
  });

  it("accepts optional rule terminators and Bison named references", () => {
    const result = parseFixture("bison-named-references.y");
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.ir?.rules.map((rule) => rule.name)).toEqual(["input", "expression"]);
    expect(result.ir?.rules[0]?.alternatives[0]?.items[0]).toMatchObject({
      kind: "symbol",
      name: "expression",
      label: "value",
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["IR012_LOSSY_TERMINAL_LABEL", "IR014_LOSSY_RULE_LABEL"]),
    );
  });

  it("retains source statistics without retaining action bodies", () => {
    const source = `%token NUMBER
%destructor { release(value); } NUMBER
%printer { print(value); } NUMBER
%union { int value; }
%code { int helper; }
%%
/** entry */
entry: %empty { $$ = $value + $1; } ;
%%
`;
    const result = yaccFrontend.parse(
      [
        {
          name: "metrics.y",
          content: source,
        },
      ],
      {},
    );

    expect(result.ir?.sourceMetrics).toEqual({
      sourceCharacters: source.length,
      comments: { count: 1, characters: 12, documentedRules: ["entry"] },
      declarationDirectives: { destructor: 1, printer: 1, union: 1, code: 1 },
      explicitEmptyAlternatives: 1,
      actionReferences: { positional: 2, named: 1 },
    });
    expect(result.ir?.rules[0]?.alternatives[0]?.action).toEqual({
      present: true,
      codeLength: 19,
    });
  });

  it("rejects %empty combined with grammar symbols", () => {
    const result = yaccFrontend.parse(
      [{ name: "invalid-empty.y", content: "%token TOKEN\n%%\nstart: %empty TOKEN ;\n%%\n" }],
      {},
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "YACC210_INVALID_EMPTY", severity: "error" }),
    );
    expect(result.ir?.sourceMetrics?.explicitEmptyAlternatives).toBe(0);
    expect(validateIR(result.ir).ok).toBe(true);
  });

  it("merges repeated rule declarations into one canonical rule", () => {
    const result = yaccFrontend.parse(
      [
        {
          name: "duplicate.y",
          content: "%%\ninput: helper ;\ninput: NUM ;\nhelper: NUM ;\n%%\n",
        },
      ],
      {},
    );
    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.ir?.rules.map((rule) => [rule.name, rule.alternatives.length])).toEqual([
      ["input", 2],
      ["helper", 1],
    ]);
  });

  it("is deterministic with stripped locations", () => {
    const result = parseFixture("calc.y");
    expect(serializeCanonical(result.ir, { stripLocations: true })).toBe(
      serializeCanonical(result.ir, { stripLocations: true }),
    );
  });

  it("preserves Lrama parameters and classifies stdlib calls as external", () => {
    const result = parseFixture("lrama.y");
    expect(result.ir?.source.format).toBe("lrama");
    expect(result.ir?.capabilities.parameterizedRules).toBe(true);
    expect(result.ir?.rules.find((rule) => rule.name === "wrapper")).toMatchObject({
      params: ["X"],
      isInline: true,
      declaredType: "node",
    });
    expect(result.ir?.externalSymbols).toEqual([
      { name: "list", origin: "stdlib", kind: "rule" },
      { name: "option", origin: "stdlib", kind: "rule" },
      { name: "separated_list", origin: "stdlib", kind: "rule" },
    ]);
  });

  it("keeps ordinary rules separate from same-name parameterized templates", () => {
    const files = [
      {
        name: "overloaded.y",
        content: `%token A B
%rule words(X): X ;
%%
entry: words words(A) ;
words: B ;
`,
      },
    ];
    const result = yaccFrontend.parse(files, {});
    const templateName = "@yacc/parameterized/words/1";

    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.rules.map((rule) => rule.name)).toEqual([templateName, "entry", "words"]);
    expect(result.ir?.rules[0]).toMatchObject({
      params: ["X"],
      alternatives: [{ items: [{ kind: "symbol", name: "X" }] }],
    });
    expect(result.ir?.rules[1]?.alternatives[0]?.items).toEqual([
      { kind: "symbol", name: "words" },
      { kind: "symbol", name: templateName, args: [{ kind: "terminal", name: "A" }] },
    ]);
    expect(result.ir?.rules[2]?.alternatives[0]?.items).toEqual([{ kind: "terminal", name: "B" }]);
    expect(serializeCanonical(result.ir)).toBe(
      serializeCanonical(yaccFrontend.parse(files, {}).ir),
    );
  });

  it("separates template arities, merges matching signatures, and preserves formal calls", () => {
    const result = yaccFrontend.parse(
      [
        {
          name: "arities.y",
          content: `%token A B
/* template documentation */
%rule words(X): X ;
%rule words(X, Y): X Y ;
%rule words(X): X X ;
%rule local(words): words(A) ;
%rule untouched(X): X ;
%%
entry: words(A)? words(A, B) local(untouched) ;
`,
        },
      ],
      {},
    );
    const unaryName = "@yacc/parameterized/words/1";
    const binaryName = "@yacc/parameterized/words/2";

    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.rules.map((rule) => [rule.name, rule.alternatives.length])).toEqual([
      [unaryName, 2],
      [binaryName, 1],
      ["local", 1],
      ["untouched", 1],
      ["entry", 1],
    ]);
    expect(result.ir?.rules[2]?.alternatives[0]?.items).toEqual([
      { kind: "symbol", name: "words", args: [{ kind: "terminal", name: "A" }] },
    ]);
    expect(result.ir?.rules[4]?.alternatives[0]?.items).toEqual([
      {
        kind: "opt",
        expr: { kind: "symbol", name: unaryName, args: [{ kind: "terminal", name: "A" }] },
      },
      {
        kind: "symbol",
        name: binaryName,
        args: [
          { kind: "terminal", name: "A" },
          { kind: "terminal", name: "B" },
        ],
      },
      { kind: "symbol", name: "local", args: [{ kind: "symbol", name: "untouched" }] },
    ]);
  });

  it("avoids existing rule identities in the reserved template namespace", () => {
    const { ast } = parseYaccAst("%rule words(X): X ;\n%%\nwords: 'a' ;\n");
    const original = ast.rules[1];
    if (!original) throw new Error("missing ordinary test rule");
    const reservedName = "@yacc/parameterized/words/1";
    const ir = lowerYaccAst(
      { ...ast, rules: [...ast.rules, { ...original, name: reservedName }] },
      { fileNames: ["identities.y"], frontendId: "yacc-family", frontendVersion: "0.2.1" },
    );

    expect(validateIR(ir).ok).toBe(true);
    expect(ir.rules.map((rule) => rule.name)).toEqual([`${reservedName}~1`, "words", reservedName]);
  });

  it("lets formal parameters shadow declared terminals", () => {
    const result = yaccFrontend.parse(
      [{ name: "shadow.y", content: "%token X A\n%rule p(X): X ;\n%%\nentry: p(A) ;\n" }],
      {},
    );

    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.rules[0]?.alternatives[0]?.items).toEqual([{ kind: "symbol", name: "X" }]);
    expect(result.ir?.rules[1]?.alternatives[0]?.items).toEqual([
      { kind: "symbol", name: "p", args: [{ kind: "terminal", name: "A" }] },
    ]);
  });

  it("normalizes repeated template binders without capturing global references", () => {
    const result = yaccFrontend.parse(
      [
        {
          name: "binders.y",
          content: `%token A B X X_1
%rule pair(X, Y): X(Y) ;
%rule pair(Y, X): Y(X) ;
%rule pair(Z, W): X X_1 Z(W)? ;
%rule simple(P): P ;
%rule simple(Q): Q ;
%%
entry: pair(A, B) simple(A) ;
`,
        },
      ],
      {},
    );

    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.rules[0]).toMatchObject({
      name: "pair",
      params: ["X_2", "Y"],
      alternatives: [
        { items: [{ kind: "symbol", name: "X_2", args: [{ kind: "symbol", name: "Y" }] }] },
        { items: [{ kind: "symbol", name: "X_2", args: [{ kind: "symbol", name: "Y" }] }] },
        {
          items: [
            { kind: "terminal", name: "X" },
            { kind: "terminal", name: "X_1" },
            {
              kind: "opt",
              expr: { kind: "symbol", name: "X_2", args: [{ kind: "symbol", name: "Y" }] },
            },
          ],
        },
      ],
    });
    expect(result.ir?.rules[1]).toMatchObject({
      name: "simple",
      params: ["P"],
      alternatives: [
        { items: [{ kind: "symbol", name: "P" }] },
        { items: [{ kind: "symbol", name: "P" }] },
      ],
    });
  });

  it.each(["", "%start words\n"])(
    "diagnoses ambiguous overloaded template starts while keeping IR canonical (%s)",
    (startDeclaration) => {
      const result = yaccFrontend.parse(
        [
          {
            name: "template-start.y",
            content: `${startDeclaration}%%\nwords(X): X ;\nwords(X, Y): X Y ;\n`,
          },
        ],
        {},
      );

      expect(validateIR(result.ir).ok).toBe(true);
      expect(result.ir?.startSymbols).toEqual([]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ code: "YACC301_AMBIGUOUS_START_SYMBOL", severity: "error" }),
      ]);
    },
  );

  it("resolves an overloaded start to its zero-argument template", () => {
    const result = yaccFrontend.parse(
      [{ name: "empty-parameters.y", content: "%%\nwords(): 'a' ;\nwords(X): X ;\n" }],
      {},
    );

    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.startSymbols).toEqual(["@yacc/parameterized/words/0"]);
  });

  it.each(["template", "ordinary"])(
    "attributes documentation only to the %s declaration",
    (kind) => {
      const result = yaccFrontend.parse(
        [
          {
            name: "documented-collision.y",
            content: `%token A B
${kind === "template" ? "/* docs */\n" : ""}%rule words(X): X ;
%%
entry: words(A) words ;
${kind === "ordinary" ? "/* docs */\n" : ""}words: B ;
`,
          },
        ],
        {},
      );

      expect(validateIR(result.ir).ok).toBe(true);
      expect(result.diagnostics).toEqual([]);
      expect(result.ir?.sourceMetrics?.comments?.documentedRules).toEqual([
        kind === "template" ? "@yacc/parameterized/words/1" : "words",
      ]);
    },
  );

  it("attributes documentation only to the documented template arity", () => {
    const result = yaccFrontend.parse(
      [
        {
          name: "documented-arity.y",
          content: `%token A B
%rule words(X): X ;
/* docs */
%rule words(X, Y): X Y ;
%%
entry: words(A) words(A, B) ;
`,
        },
      ],
      {},
    );

    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.sourceMetrics?.comments?.documentedRules).toEqual([
      "@yacc/parameterized/words/2",
    ]);
  });

  it("marks a merged template documented when any matching declaration has documentation", () => {
    const result = yaccFrontend.parse(
      [
        {
          name: "documented-merge.y",
          content: `%token A B
%rule words(X): X ;
/* docs */
%rule words(Y): Y Y ;
/* more docs */
%rule words(Z): Z Z Z ;
%%
entry: words(A) words ;
words: B ;
`,
        },
      ],
      {},
    );

    expect(validateIR(result.ir).ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.sourceMetrics?.comments?.documentedRules).toEqual([
      "@yacc/parameterized/words/1",
    ]);
  });

  it.each([
    "%rule words(X): X ;\n%%\nwords: 'a' ;\n",
    "%rule words(X): X ;\n%rule words(X, Y): X Y ;\n%%\nentry: words('a') ;\n",
  ])("does not invent declaration coverage from ambiguous legacy AST documentation", (content) => {
    const { ast } = parseYaccAst(`/* docs */\n${content}`);
    const ir = lowerYaccAst(
      {
        ...ast,
        rules: ast.rules.map(({ documented: _documented, ...rule }) => rule),
      },
      { fileNames: ["legacy-docs.y"], frontendId: "yacc-family", frontendVersion: "0.2.1" },
    );

    expect(validateIR(ir).ok).toBe(true);
    expect(ir.sourceMetrics?.comments).toBeUndefined();
    expect(ir.sourceMetrics?.sourceCharacters).toBe(ast.sourceMetrics?.sourceCharacters);
    expect(ir.sourceMetrics?.declarationDirectives).toEqual(
      ast.sourceMetrics?.declarationDirectives,
    );
    expect(ir.diagnostics).toEqual([
      expect.objectContaining({
        code: "YACC302_AMBIGUOUS_RULE_DOCUMENTATION",
        severity: "warning",
      }),
    ]);
  });

  it("retains unambiguous legacy AST documentation for merged signatures", () => {
    const { ast } = parseYaccAst(`/* docs */
%rule words(X): X ;
/* more docs */
%rule words(Y): Y Y ;
%%
entry: words('a') ;
`);
    const ir = lowerYaccAst(
      { ...ast, rules: ast.rules.map(({ documented: _documented, ...rule }) => rule) },
      { fileNames: ["legacy-docs.y"], frontendId: "yacc-family", frontendVersion: "0.2.1" },
    );

    expect(validateIR(ir).ok).toBe(true);
    expect(ir.sourceMetrics?.comments?.documentedRules).toEqual(["words"]);
    expect(ir.diagnostics).toEqual([]);
  });
});
