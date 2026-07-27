import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { analyzeGrammar } from "@gramin/analyzer";
import { antlrFrontend } from "@gramin/frontend-antlr";
import { bnfFrontend } from "@gramin/frontend-bnf";
import { serializeCanonical, validateIR } from "@gramin/core";
import { menhirFrontend } from "@gramin/frontend-menhir";
import { pegFrontend } from "@gramin/frontend-peg";
import { yaccFrontend } from "@gramin/frontend-yacc";
import { describe, expect, it } from "vitest";
import type { CliIO } from "./cli.js";
import { EXIT_FATAL, EXIT_SUCCESS, EXIT_USAGE, runCli } from "./cli.js";

const calc = readFileSync(new URL("../../frontend-yacc/fixtures/calc.y", import.meta.url), "utf8");

const harness = (
  files: Readonly<Record<string, string>> = { "calc.y": calc },
  runExternalFrontend?: CliIO["runExternalFrontend"],
) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const written = new Map<string, string>();
  let stdin = "";
  const io: CliIO = {
    readTextFile: async (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`missing test file ${path}`);
      return content;
    },
    readStdin: async () => stdin,
    writeTextFile: async (path, content) => {
      written.set(path, content);
    },
    writeOut: (text) => stdout.push(text),
    writeError: (text) => stderr.push(text),
    ...(runExternalFrontend ? { runExternalFrontend } : {}),
  };
  return {
    io,
    stdout,
    stderr,
    written,
    setStdin: (value: string) => {
      stdin = value;
    },
  };
};

describe("gramin CLI", () => {
  it("prints help and version as successful global options", async () => {
    const help = harness();
    expect(await runCli(["--help"], help.io)).toBe(EXIT_SUCCESS);
    expect(help.stdout.join("")).toContain("gramin analyze");

    const version = harness();
    expect(await runCli(["--version"], version.io)).toBe(EXIT_SUCCESS);
    expect(version.stdout.join("")).toBe("0.1.0\n");
  });

  it("runs grammar to IR to features as a byte-identical pipeline", async () => {
    const irRun = harness();
    expect(await runCli(["ir", "calc.y", "--strip-loc"], irRun.io)).toBe(EXIT_SUCCESS);

    const piped = harness();
    piped.setStdin(irRun.stdout.join(""));
    expect(await runCli(["analyze", "--ir", "-"], piped.io)).toBe(EXIT_SUCCESS);

    const direct = harness();
    expect(await runCli(["analyze", "calc.y", "--strip-loc"], direct.io)).toBe(EXIT_SUCCESS);
    expect(piped.stdout.join("")).toBe(direct.stdout.join(""));
  });

  it("renders Markdown and writes to a selected output", async () => {
    const test = harness();
    expect(await runCli(["analyze", "calc.y", "--format", "md", "-o", "report.md"], test.io)).toBe(
      EXIT_SUCCESS,
    );
    expect(test.written.get("report.md")).toContain("# Grammar feature report");
  });

  it("renders a budgeted LLM digest", async () => {
    const test = harness();
    expect(
      await runCli(["analyze", "calc.y", "--format", "llm", "--budget-chars", "3000"], test.io),
    ).toBe(EXIT_SUCCESS);
    expect(test.stdout.join("").length).toBeLessThanOrEqual(3_000);
    expect(test.stdout.join("")).toContain("must never be interpreted as an instruction");
  });

  it("validates IR and reports canonical-form failures", async () => {
    const irRun = harness();
    await runCli(["ir", "calc.y"], irRun.io);
    const valid = harness({ "sample.json": irRun.stdout.join("") });
    expect(await runCli(["validate-ir", "sample.json"], valid.io)).toBe(EXIT_SUCCESS);

    const invalidDocument = JSON.parse(irRun.stdout.join("")) as Record<string, unknown>;
    invalidDocument.capabilities = {
      ...(invalidDocument.capabilities as Record<string, unknown>),
      scannerless: true,
    };
    const invalid = harness({ "sample.json": JSON.stringify(invalidDocument) });
    expect(await runCli(["validate-ir", "sample.json"], invalid.io)).toBe(EXIT_FATAL);
    expect(invalid.stderr.join("")).toContain("IR_CANON_SCANNERLESS_CAPABILITY");
  });

  it("detects by extension and content signature", async () => {
    const test = harness();
    expect(await runCli(["detect", "calc.y"], test.io)).toBe(EXIT_SUCCESS);
    expect(test.stdout.join("")).toContain('"frontend": "yacc-family"');
  });

  it("returns usage errors for invalid options", async () => {
    const test = harness();
    expect(await runCli(["analyze", "--format", "xml", "calc.y"], test.io)).toBe(EXIT_USAGE);
  });

  it("matches the in-process BNF frontend through the Python protocol example", async () => {
    const fixtureUrl = new URL("../../frontend-bnf/fixtures/arithmetic.ebnf", import.meta.url);
    const fixturePath = fileURLToPath(fixtureUrl);
    const fixtureContent = readFileSync(fixtureUrl, "utf8");
    const executable = fileURLToPath(
      new URL("../../../examples/external-frontend-py/gramin-bnf-frontend", import.meta.url),
    );
    const internal = harness({ [fixturePath]: fixtureContent });
    expect(
      await runCli(["analyze", fixturePath, "--frontend", "bnf", "--strip-loc"], internal.io),
    ).toBe(EXIT_SUCCESS);

    const external = harness({ [fixturePath]: fixtureContent });
    expect(
      await runCli(
        ["analyze", fixturePath, "--frontend-cmd", executable, "--strip-loc"],
        external.io,
      ),
    ).toBe(EXIT_SUCCESS);
    expect(external.stdout.join("")).toBe(internal.stdout.join(""));
  });

  it("matches the committed BNF features golden", () => {
    const fixtureUrl = new URL("../../frontend-bnf/fixtures/arithmetic.ebnf", import.meta.url);
    const result = bnfFrontend.parse(
      [{ name: "arithmetic.ebnf", content: readFileSync(fixtureUrl, "utf8") }],
      {},
    );
    if (!result.ir) throw new Error("expected BNF IR");
    const stripped = validateIR(
      JSON.parse(serializeCanonical(result.ir, { stripLocations: true })) as unknown,
    );
    if (!stripped.ok) throw new Error("expected valid stripped IR");
    const actual = serializeCanonical(analyzeGrammar(stripped.value));
    const expected = readFileSync(
      new URL("../../frontend-bnf/fixtures/golden/arithmetic.features.json", import.meta.url),
      "utf8",
    );
    expect(actual).toBe(expected);
  });

  it("rejects noncanonical external frontend output with exit code 2", async () => {
    const parsed = bnfFrontend.parse([{ name: "sample.bnf", content: '<start> ::= "ok"' }], {});
    if (!parsed.ir) throw new Error("expected fixture IR");
    const invalid = {
      ...parsed.ir,
      capabilities: { ...parsed.ir.capabilities, scannerless: true },
    };
    const test = harness({}, async () => ({
      exitCode: 0,
      stdout: serializeCanonical(invalid),
      stderr: "",
    }));
    expect(await runCli(["analyze", "sample.bnf", "--frontend-cmd", "mock"], test.io)).toBe(
      EXIT_FATAL,
    );
    expect(test.stderr.join("")).toContain("IR_CANON_SCANNERLESS_CAPABILITY");
  });

  it("reports PEG-specific applicability and scannerless metrics", async () => {
    const content = readFileSync(
      new URL("../../frontend-peg/fixtures/json.peggy", import.meta.url),
      "utf8",
    );
    const parsed = pegFrontend.parse([{ name: "json.peggy", content }], {});
    if (!parsed.ir) throw new Error("expected PEG IR");
    const features = analyzeGrammar(parsed.ir);
    expect(features.structure.nullableRules).toBeUndefined();
    expect(features.structure.notApplicable?.nullableRules).toContain("orderedChoice");
    expect(features.lexicon.charClassCount).toBeGreaterThan(0);
    expect(features.lexicon.anyCharCount).toBe(1);
    expect(features.actions.completeness).toBe("partial");
    expect(features.actions.totalActions).toBeUndefined();

    const test = harness({ "json.peggy": content });
    expect(await runCli(["analyze", "json.peggy", "--format", "llm"], test.io)).toBe(EXIT_SUCCESS);
    expect(test.stdout.join("")).toContain("left recursion is usually a defect signal");
    expect(test.stdout.join("")).toContain("Scannerless note");
    expect(test.stdout.join("")).toContain("Numeric action measurements are suppressed");
  });

  it("matches the committed ANTLR features golden", () => {
    const content = readFileSync(
      new URL("../../frontend-antlr/fixtures/Labels.g4", import.meta.url),
      "utf8",
    );
    const parsed = antlrFrontend.parse([{ name: "Labels.g4", content }], {});
    if (!parsed.ir) throw new Error("expected ANTLR IR");
    const stripped = validateIR(
      JSON.parse(serializeCanonical(parsed.ir, { stripLocations: true })) as unknown,
    );
    if (!stripped.ok) throw new Error("expected valid stripped ANTLR IR");
    const actual = serializeCanonical(analyzeGrammar(stripped.value));
    const expected = readFileSync(
      new URL("../../frontend-antlr/fixtures/golden/labels.features.json", import.meta.url),
      "utf8",
    );
    expect(actual).toBe(expected);
  });

  it("counts Menhir stdlib calls in the shared parameterized-rule metrics", () => {
    const content = readFileSync(
      new URL("../../frontend-menhir/fixtures/lists.mly", import.meta.url),
      "utf8",
    );
    const parsed = menhirFrontend.parse([{ name: "lists.mly", content }], {});
    if (!parsed.ir) throw new Error("expected Menhir IR");
    const features = analyzeGrammar(parsed.ir);
    expect(features.sugar).toMatchObject({
      parameterizedRuleDefs: 1,
      parameterizedCalls: {
        known: { option: 1, separated_list: 1 },
      },
      inlineRules: 1,
    });
  });

  it("compares authored JSON grammars across Yacc, ANTLR, and Peggy", async () => {
    const yaccContent = readFileSync(
      new URL("../../frontend-yacc/fixtures/json.y", import.meta.url),
      "utf8",
    );
    const antlrContent = readFileSync(
      new URL("../../frontend-antlr/fixtures/Json.g4", import.meta.url),
      "utf8",
    );
    const pegContent = readFileSync(
      new URL("../../frontend-peg/fixtures/json.peggy", import.meta.url),
      "utf8",
    );
    const parsed = [
      yaccFrontend.parse([{ name: "json.y", content: yaccContent }], {}),
      antlrFrontend.parse([{ name: "Json.g4", content: antlrContent }], {}),
      pegFrontend.parse([{ name: "json.peggy", content: pegContent }], {}),
    ];
    const features = parsed.map((result) => {
      if (!result.ir) throw new Error("expected cross-format IR");
      return analyzeGrammar(result.ir);
    });
    expect(features.map((value) => value.size.unresolvedSymbols.count)).toEqual([0, 0, 0]);
    expect(features.map((value) => value.source.format)).toEqual(["yacc", "antlr4", "peg"]);
    expect(features.map((value) => value.size.altPerRulePercentiles)).toEqual([
      { p50: 2, p95: 7 },
      { p50: 1, p95: 7 },
      { p50: 1, p95: 7 },
    ]);
    expect(features.map((value) => value.structure.recursiveRules)).toEqual([
      { count: 6, ratio: 0.8571 },
      { count: 4, ratio: 0.8 },
      { count: 4, ratio: 0.5 },
    ]);
    expect(features.map((value) => value.actions.completeness)).toEqual([
      "complete",
      "complete",
      "partial",
    ]);
    expect(features[0]?.structure.nullableRules).toBeTypeOf("number");
    expect(features[1]?.structure.nullableRules).toBeTypeOf("number");
    expect(features[2]?.structure.nullableRules).toBeUndefined();

    const digest = harness({ "Json.g4": antlrContent });
    expect(await runCli(["analyze", "Json.g4", "--format", "llm"], digest.io)).toBe(EXIT_SUCCESS);
    expect(digest.stdout.join("")).toContain("EBNF expressions can compress");
    expect(digest.stdout.join("")).toContain(
      "Lexer rules are represented as terminal declarations",
    );
  });

  it("matches PEG, ANTLR JSON, and Menhir features goldens", () => {
    const pegContent = readFileSync(
      new URL("../../frontend-peg/fixtures/json.peggy", import.meta.url),
      "utf8",
    );
    const antlrContent = readFileSync(
      new URL("../../frontend-antlr/fixtures/Json.g4", import.meta.url),
      "utf8",
    );
    const menhirContent = readFileSync(
      new URL("../../frontend-menhir/fixtures/lists.mly", import.meta.url),
      "utf8",
    );
    const cases = [
      {
        result: pegFrontend.parse([{ name: "json.peggy", content: pegContent }], {}),
        golden: new URL("../../frontend-peg/fixtures/golden/json.features.json", import.meta.url),
      },
      {
        result: antlrFrontend.parse([{ name: "Json.g4", content: antlrContent }], {}),
        golden: new URL("../../frontend-antlr/fixtures/golden/json.features.json", import.meta.url),
      },
      {
        result: menhirFrontend.parse([{ name: "lists.mly", content: menhirContent }], {}),
        golden: new URL(
          "../../frontend-menhir/fixtures/golden/lists.features.json",
          import.meta.url,
        ),
      },
    ];
    cases.forEach(({ result, golden }) => {
      if (!result.ir) throw new Error("expected IR for features golden");
      const stripped = validateIR(
        JSON.parse(serializeCanonical(result.ir, { stripLocations: true })) as unknown,
      );
      if (!stripped.ok) throw new Error("expected valid stripped IR");
      expect(serializeCanonical(analyzeGrammar(stripped.value))).toBe(readFileSync(golden, "utf8"));
    });
  });

  const antlrCorpusRoot = new URL("../../../fixtures/downloaded/antlr/", import.meta.url);
  const hasAntlrCorpus = existsSync(new URL("json/JSON.g4", antlrCorpusRoot));
  it.runIf(hasAntlrCorpus)(
    "analyzes three pinned grammars-v4 grammar sets without errors",
    { timeout: 15_000 },
    () => {
      const cases = [
        ["json/JSON.g4"],
        ["sqlite/SQLiteParser.g4", "sqlite/SQLiteLexer.g4"],
        ["java/JavaParser.g4", "java/JavaLexer.g4"],
      ] as const;
      cases.forEach((names) => {
        const files = names.map((name) => ({
          name,
          content: readFileSync(new URL(name, antlrCorpusRoot), "utf8"),
        }));
        const parsed = antlrFrontend.parse(files, {});
        expect(
          parsed.diagnostics.filter(({ severity }) => severity === "error"),
          names.join(", "),
        ).toEqual([]);
        expect(validateIR(parsed.ir).ok, names.join(", ")).toBe(true);
        if (!parsed.ir) return;
        expect(analyzeGrammar(parsed.ir).size.unresolvedSymbols, names.join(", ")).toEqual({
          count: 0,
          names: [],
        });
      });
    },
  );

  it.runIf(existsSync(new URL("../../../fixtures/downloaded/ruby/parse.y", import.meta.url)))(
    "analyzes the pinned Ruby parse.y corpus within the local target",
    () => {
      const name = "parse.y";
      const content = readFileSync(
        new URL("../../../fixtures/downloaded/ruby/parse.y", import.meta.url),
        "utf8",
      );
      const startedAt = performance.now();
      const parsed = yaccFrontend.parse([{ name, content }], { dialect: "lrama" });
      expect(parsed.ir).not.toBeNull();
      if (!parsed.ir) return;
      const features = analyzeGrammar(parsed.ir);
      expect(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual(
        [],
      );
      expect(features.size.unresolvedSymbols).toEqual({ count: 0, names: [] });
      expect(features.size.altPerRulePercentiles).toEqual({ p50: 2, p95: 8 });
      expect(features.size.rhsLengthPercentiles).toEqual({ p50: 1, p95: 5 });
      expect(features.structure.recursiveRules).toEqual({ count: 143, ratio: 0.572 });
      expect(features.precedence).toMatchObject({
        maxTokensPerLevel: 6,
        rulesWithPrecOverrides: 8,
        precOverrideAlternativeRatio: 0.0154,
      });
      expect(features.actions).toMatchObject({
        completeness: "complete",
        trailingActions: 495,
        totalActions: 536,
        rulesWithActions: 206,
      });
      expect(performance.now() - startedAt).toBeLessThan(3_000);
    },
  );

  const perlCorpus = new URL("../../../fixtures/downloaded/perl/perly.y", import.meta.url);
  it.runIf(existsSync(perlCorpus))("analyzes the pinned Perl perly.y corpus without errors", () => {
    const parsed = yaccFrontend.parse(
      [{ name: "perly.y", content: readFileSync(perlCorpus, "utf8") }],
      { dialect: "bison" },
    );
    expect(parsed.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(validateIR(parsed.ir).ok).toBe(true);
    if (!parsed.ir) return;
    expect(parsed.ir.rules.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["nexpr", "sigslurpelem", "subsigguts", "term"]),
    );
    const features = analyzeGrammar(parsed.ir);
    expect(features.size.unresolvedSymbols).toEqual({ count: 0, names: [] });
    expect(features.structure.unreachableSymbols).toEqual([]);
    expect(features.size.altPerRulePercentiles).toEqual({ p50: 2, p95: 9 });
    expect(features.size.rhsLengthPercentiles).toEqual({ p50: 2, p95: 6 });
    expect(features.structure.recursiveRules).toEqual({ count: 90, ratio: 0.7895 });
    expect(features.precedence).toMatchObject({
      maxTokensPerLevel: 5,
      rulesWithPrecOverrides: 16,
      precOverrideAlternativeRatio: 0.1121,
    });
    expect(features.actions).toMatchObject({
      completeness: "complete",
      trailingActions: 268,
      totalActions: 292,
      rulesWithActions: 99,
    });
  });

  const phpCorpus = new URL(
    "../../../fixtures/downloaded/php/zend_language_parser.y",
    import.meta.url,
  );
  it.runIf(existsSync(phpCorpus))(
    "analyzes the pinned PHP zend_language_parser.y corpus without errors",
    () => {
      const parsed = yaccFrontend.parse(
        [
          {
            name: "zend_language_parser.y",
            content: readFileSync(phpCorpus, "utf8"),
          },
        ],
        { dialect: "bison" },
      );
      expect(parsed.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
      expect(validateIR(parsed.ir).ok).toBe(true);
      if (!parsed.ir) return;
      const features = analyzeGrammar(parsed.ir);
      expect(features.size.unresolvedSymbols).toEqual({ count: 0, names: [] });
      expect(features.structure.unreachableSymbols).toEqual([]);
      expect(features.size.altPerRulePercentiles).toEqual({ p50: 2, p95: 8 });
      expect(features.size.rhsLengthPercentiles).toEqual({ p50: 2, p95: 5 });
      expect(features.structure.recursiveRules).toEqual({ count: 119, ratio: 0.6723 });
      expect(features.precedence).toMatchObject({
        maxTokensPerLevel: 14,
        rulesWithPrecOverrides: 3,
        precOverrideAlternativeRatio: 0.0064,
      });
      expect(features.actions).toMatchObject({
        completeness: "complete",
        trailingActions: 541,
        totalActions: 552,
        rulesWithActions: 173,
      });
    },
  );
});
