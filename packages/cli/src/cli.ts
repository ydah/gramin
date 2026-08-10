import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { analyzeGrammar } from "@gramin/analyzer";
import {
  canonicalize,
  type Diagnostic,
  type Frontend,
  type GrammarFeatures,
  type GrammarIR,
  type SourceFile,
  serializeCanonical,
  validateFeatures,
  validateIR,
} from "@gramin/core";
import { antlrFrontend } from "@gramin/frontend-antlr";
import { bnfFrontend } from "@gramin/frontend-bnf";
import { menhirFrontend } from "@gramin/frontend-menhir";
import { pegFrontend } from "@gramin/frontend-peg";
import { yaccFrontend } from "@gramin/frontend-yacc";
import {
  DigestBudgetTooSmallError,
  diffFeatures,
  renderJson,
  renderFeatureDiffJson,
  renderFeatureDiffMarkdown,
  renderLlmDigest,
  renderMarkdown,
  renderSarif,
} from "@gramin/reporter";
import { type FailOn, type ParsedArguments, parseArguments } from "./arguments.js";
import {
  ExternalFrontendLimitError,
  type ExternalFrontendRunner,
  runExternalFrontendProcess,
} from "./external-frontend.js";
import { CLI_VERSION } from "./version.js";

export const EXIT_SUCCESS = 0;
export const EXIT_PARTIAL = 1;
export const EXIT_FATAL = 2;
export const EXIT_USAGE = 3;

export interface CliIO {
  readonly readTextFile: (path: string) => Promise<string>;
  readonly readStdin: () => Promise<string>;
  readonly writeTextFile: (path: string, content: string) => Promise<void>;
  readonly writeOut: (text: string) => void;
  readonly writeError: (text: string) => void;
  readonly runExternalFrontend?: ExternalFrontendRunner;
}

const readStandardInput = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const defaultIO: CliIO = {
  readTextFile: (path) => readFile(path, "utf8"),
  readStdin: readStandardInput,
  writeTextFile: (path, content) => writeFile(path, content),
  writeOut: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
  runExternalFrontend: runExternalFrontendProcess,
};

const frontends: readonly Frontend[] = [
  yaccFrontend,
  bnfFrontend,
  pegFrontend,
  antlrFrontend,
  menhirFrontend,
];

const usage = `Usage:
  gramin analyze <file...> [--format json|md|llm|sarif] [--frontend <id>] [--dialect <name>] [--fail-on error|warning|none]
    [--source-name <name> | --source-root <dir>] [--max-nesting-depth <n>] [--baseline <features.json>] [--fail-on-regression]
  gramin analyze <file...> --frontend-cmd <executable> [--dialect <name>] [--frontend-timeout <ms>]
  gramin analyze --ir <ir.json|-> [--format json|md|sarif]
  gramin ir <file...> [--frontend <id>] [--dialect <name>] [--strip-loc] [--source-name <name> | --source-root <dir>]
  gramin diff <old-file> <new-file> [--format json|md]
  gramin detect <file>
  gramin validate-ir <ir.json>
  gramin --help
  gramin --version
`;

const issueText = (code: string, path: string, message: string): string =>
  `${code} ${path}: ${message}\n`;

interface ParsedIR {
  readonly ir: GrammarIR;
  readonly exitCode: number;
}

const applySourceName = (ir: GrammarIR, sourceName: string | undefined): GrammarIR =>
  sourceName === undefined ? ir : { ...ir, source: { ...ir.source, fileNames: [sourceName] } };

const normalizeSourcePath = (fileName: string, sourceRoot: string): string => {
  if (fileName === "-") return fileName;
  return relative(resolve(sourceRoot), resolve(fileName)).split(sep).join("/");
};

const applySourcePathOptions = (ir: GrammarIR, options: ParsedArguments): GrammarIR => {
  if (options.sourceName !== undefined) return applySourceName(ir, options.sourceName);
  if (options.sourceRoot === undefined || ir.source.fileNames === undefined) return ir;
  const names = options.files
    .slice(0, ir.source.fileNames.length)
    .map((fileName) => normalizeSourcePath(fileName, options.sourceRoot as string));
  return { ...ir, source: { ...ir.source, fileNames: names } };
};

const severityRank = { info: 0, warning: 1, error: 2 } as const;

const exitCodeForDiagnostics = (diagnostics: readonly Diagnostic[], failOn: FailOn): number => {
  if (failOn === "none") return EXIT_SUCCESS;
  const threshold = severityRank[failOn];
  const worst = diagnostics.reduce(
    (maximum, diagnostic) => Math.max(maximum, severityRank[diagnostic.severity]),
    -1,
  );
  return worst >= threshold ? EXIT_PARTIAL : EXIT_SUCCESS;
};

const readJsonIR = async (
  path: string,
  io: CliIO,
  failOn: FailOn,
): Promise<ParsedIR | undefined> => {
  const content = path === "-" ? await io.readStdin() : await io.readTextFile(path);
  let input: unknown;
  try {
    input = JSON.parse(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeError(`IR_JSON_INVALID ${path}: ${message}\n`);
    return undefined;
  }
  const result = validateIR(input);
  if (result.ok) {
    return {
      ir: result.value,
      exitCode: exitCodeForDiagnostics(result.value.diagnostics, failOn),
    };
  }
  result.issues.forEach((issue) => {
    io.writeError(issueText(issue.code, issue.path, issue.message));
  });
  return undefined;
};

const readFeatures = async (path: string, io: CliIO): Promise<GrammarFeatures | undefined> => {
  let input: unknown;
  try {
    input = JSON.parse(await io.readTextFile(path));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeError(`BASELINE_INVALID ${path}: ${message}\n`);
    return undefined;
  }
  const result = validateFeatures(input);
  if (result.ok) return result.value;
  result.issues.forEach((issue) => {
    io.writeError(`BASELINE_INVALID ${path} ${issue.path}: ${issue.message}\n`);
  });
  return undefined;
};

interface FrontendSelection {
  readonly frontend: Frontend;
  readonly diagnostic?: Diagnostic;
  readonly ambiguous: boolean;
}

const selectFrontend = (
  files: readonly SourceFile[],
  explicitId: string | undefined,
): FrontendSelection | undefined => {
  if (explicitId) {
    const frontend = frontends.find((candidate) => candidate.id === explicitId);
    return frontend ? { frontend, ambiguous: false } : undefined;
  }
  const first = files[0];
  if (!first) return undefined;
  const ranked = frontends
    .map((frontend, index) => ({
      frontend,
      index,
      confidence: frontend.detect(first.name, first.content.slice(0, 4096)),
    }))
    .sort((left, right) => right.confidence - left.confidence || left.index - right.index);
  const best = ranked[0];
  if (!best || best.confidence < 0.3) return undefined;
  const second = ranked[1];
  const ambiguous = second !== undefined && best.confidence - second.confidence < 0.1;
  return {
    frontend: best.frontend,
    ambiguous,
    ...(ambiguous
      ? {
          diagnostic: {
            severity: "warning",
            code: "DETECT_AMBIGUOUS",
            message:
              `format detection is ambiguous (${best.frontend.id}=${best.confidence}, ` +
              `${second.frontend.id}=${second.confidence}); pass --frontend to disambiguate`,
          } satisfies Diagnostic,
        }
      : {}),
  };
};

const parseSourceIR = async (
  options: ParsedArguments,
  io: CliIO,
): Promise<{ readonly ir: GrammarIR; readonly exitCode: number } | undefined> => {
  if (options.files.length === 0) {
    io.writeError("INPUT_REQUIRED: provide a grammar file or --ir\n");
    return undefined;
  }
  if (options.frontendCommand) {
    const useStdin = options.files.length === 1 && options.files[0] === "-";
    const stdin = useStdin ? await io.readStdin() : undefined;
    const args = [
      "parse",
      ...(options.dialect ? ["--dialect", options.dialect] : []),
      ...(useStdin ? ["--stdin"] : [...options.files]),
    ];
    const execution = await (io.runExternalFrontend ?? runExternalFrontendProcess)(
      options.frontendCommand,
      args,
      stdin,
      options.frontendTimeoutMs === undefined ? {} : { timeoutMs: options.frontendTimeoutMs },
    );
    if (execution.stderr.length > 0) io.writeError(execution.stderr);
    if (execution.exitCode !== EXIT_SUCCESS && execution.exitCode !== EXIT_PARTIAL) {
      io.writeError(
        `FRONTEND_PROCESS_FAILED: external frontend exited with ${
          execution.exitCode ?? "a signal"
        }\n`,
      );
      return undefined;
    }
    let input: unknown;
    try {
      input = JSON.parse(execution.stdout);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      io.writeError(`FRONTEND_JSON_INVALID: ${message}\n`);
      return undefined;
    }
    const validation = validateIR(input);
    if (!validation.ok) {
      validation.issues.forEach((issue) => {
        io.writeError(issueText(issue.code, issue.path, issue.message));
      });
      return undefined;
    }
    return {
      ir: applySourcePathOptions(validation.value, options),
      exitCode:
        execution.exitCode === EXIT_PARTIAL
          ? EXIT_PARTIAL
          : exitCodeForDiagnostics(validation.value.diagnostics, options.failOn),
    };
  }
  const files = await Promise.all(
    options.files.map(async (name) => ({ name, content: await io.readTextFile(name) })),
  );
  const sourceRoot = options.sourceRoot;
  const namedFiles = files.map((file) => ({
    ...file,
    name:
      options.sourceName ??
      (sourceRoot === undefined ? file.name : normalizeSourcePath(file.name, sourceRoot)),
  }));
  const selection = selectFrontend(files, options.frontend);
  if (!selection) {
    io.writeError(
      `FORMAT_UNDETECTED: no frontend reached the 0.3 threshold${
        options.frontend ? ` or matched ${options.frontend}` : ""
      }\n`,
    );
    return undefined;
  }
  if (selection.ambiguous) {
    const diagnostic = selection.diagnostic;
    io.writeError(
      `${diagnostic?.code ?? "DETECT_AMBIGUOUS"}: ${diagnostic?.message ?? "format detection is ambiguous"}\n`,
    );
    return undefined;
  }
  const parsed = selection.frontend.parse(namedFiles, {
    ...(options.dialect ? { dialect: options.dialect } : {}),
    ...(options.maxNestingDepth === undefined ? {} : { maxNestingDepth: options.maxNestingDepth }),
  });
  if (!parsed.ir) {
    parsed.diagnostics.forEach((diagnostic) => {
      io.writeError(`${diagnostic.code}: ${diagnostic.message}\n`);
    });
    return undefined;
  }
  const detectionDiagnostics = selection.diagnostic ? [selection.diagnostic] : [];
  const validation = validateIR({
    ...parsed.ir,
    diagnostics: [...parsed.ir.diagnostics, ...detectionDiagnostics],
  });
  if (!validation.ok) {
    validation.issues.forEach((issue) => {
      io.writeError(issueText(issue.code, issue.path, issue.message));
    });
    return undefined;
  }
  return {
    ir: validation.value,
    exitCode: exitCodeForDiagnostics(
      [...parsed.diagnostics, ...detectionDiagnostics],
      options.failOn,
    ),
  };
};

const output = async (content: string, path: string | undefined, io: CliIO): Promise<void> => {
  try {
    if (path) await io.writeTextFile(path, content);
    else io.writeOut(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OutputIOError(message);
  }
};

class OutputIOError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputIOError";
  }
}

const runDetect = async (options: ParsedArguments, io: CliIO): Promise<number> => {
  const fileName = options.files[0];
  if (!fileName || options.files.length !== 1) return EXIT_USAGE;
  const content = await io.readTextFile(fileName);
  const candidates = frontends.map((frontend) => ({
    frontend: frontend.id,
    confidence: frontend.detect(fileName, content.slice(0, 4096)),
  }));
  await output(`${JSON.stringify({ fileName, candidates }, null, 2)}\n`, options.output, io);
  const best = [...candidates].sort((left, right) => right.confidence - left.confidence)[0];
  const second = [...candidates].sort((left, right) => right.confidence - left.confidence)[1];
  if (best && best.confidence >= 0.3) {
    if (second && best.confidence - second.confidence < 0.1) {
      io.writeError(
        `DETECT_AMBIGUOUS: ${best.frontend}=${best.confidence}, ${second.frontend}=${second.confidence}; pass --frontend to disambiguate\n`,
      );
    }
    return EXIT_SUCCESS;
  }
  io.writeError("FORMAT_UNDETECTED: no frontend reached the 0.3 threshold\n");
  return EXIT_FATAL;
};

const runPipeline = async (options: ParsedArguments, io: CliIO): Promise<number> => {
  if (options.irInput && options.files.length > 0) return EXIT_USAGE;
  if (options.command === "ir" && (options.baseline || options.failOnRegression)) return EXIT_USAGE;
  if (options.command === "analyze" && options.failOnRegression && options.baseline === undefined) {
    io.writeError("--fail-on-regression requires --baseline <features.json>\n");
    return EXIT_USAGE;
  }
  const parsed = options.irInput
    ? await readJsonIR(options.irInput, io, options.failOn)
    : await parseSourceIR(options, io);
  if (!parsed?.ir) return EXIT_FATAL;
  let ir = parsed.ir;
  if (options.stripLocations) {
    const stripped = validateIR(canonicalize(parsed.ir, { stripLocations: true }));
    if (!stripped.ok) {
      throw new Error("location stripping produced invalid Grammar IR");
    }
    ir = stripped.value;
  }

  if (options.command === "ir") {
    await output(serializeCanonical(ir), options.output, io);
    return Math.max(parsed.exitCode, exitCodeForDiagnostics(ir.diagnostics, options.failOn));
  }
  let features = analyzeGrammar(ir);
  let regressionCount = 0;
  if (options.baseline !== undefined) {
    const baseline = await readFeatures(options.baseline, io);
    if (!baseline) return EXIT_FATAL;
    const diff = diffFeatures(baseline, features);
    regressionCount = diff.regressions.length;
    if (regressionCount > 0) {
      features = {
        ...features,
        diagnostics: [
          ...features.diagnostics,
          ...diff.regressions.map(
            (regression): Diagnostic => ({
              severity: "warning",
              code: "REGRESSION_METRIC_INCREASE",
              message: `${regression.path}: ${regression.reason} (${String(regression.before)} -> ${String(regression.after)})`,
            }),
          ),
        ],
      };
    }
  }
  const report =
    options.format === "md"
      ? renderMarkdown(features)
      : options.format === "llm"
        ? renderLlmDigest(features, {
            ...(options.budgetChars === undefined ? {} : { budgetChars: options.budgetChars }),
          })
        : options.format === "sarif"
          ? renderSarif(features)
          : renderJson(features);
  await output(report, options.output, io);
  const diagnosticExit = exitCodeForDiagnostics(features.diagnostics, options.failOn);
  return options.failOnRegression && regressionCount > 0
    ? EXIT_PARTIAL
    : Math.max(parsed.exitCode, diagnosticExit);
};

const runDiff = async (options: ParsedArguments, io: CliIO): Promise<number> => {
  if (
    options.files.length !== 2 ||
    options.format === "llm" ||
    options.format === "sarif" ||
    options.baseline !== undefined
  ) {
    return EXIT_USAGE;
  }
  const beforeFile = options.files[0];
  const afterFile = options.files[1];
  if (!beforeFile || !afterFile) return EXIT_USAGE;
  const before = await parseSourceIR({ ...options, command: "analyze", files: [beforeFile] }, io);
  const after = await parseSourceIR({ ...options, command: "analyze", files: [afterFile] }, io);
  if (!before?.ir || !after?.ir) return EXIT_FATAL;
  const comparison = diffFeatures(analyzeGrammar(before.ir), analyzeGrammar(after.ir));
  const report =
    options.format === "md"
      ? renderFeatureDiffMarkdown(comparison)
      : renderFeatureDiffJson(comparison);
  await output(report, options.output, io);
  return options.failOnRegression && comparison.regressions.length > 0
    ? EXIT_PARTIAL
    : Math.max(before.exitCode, after.exitCode);
};

export const runCli = async (argv: readonly string[], io: CliIO = defaultIO): Promise<number> => {
  if (
    ((argv.length === 1 || argv.length === 2) &&
      ["--help", "-h", "help"].includes(argv.at(-1) ?? "")) ||
    (argv.length > 2 &&
      ["analyze", "ir", "diff", "detect", "validate-ir"].includes(argv[0] ?? "") &&
      argv.includes("--help"))
  ) {
    io.writeOut(usage);
    return EXIT_SUCCESS;
  }
  if (argv.length === 1 && ["--version", "-v", "version"].includes(argv[0] ?? "")) {
    io.writeOut(`${CLI_VERSION}\n`);
    return EXIT_SUCCESS;
  }
  const parsed = parseArguments(argv);
  if (!parsed.ok) {
    io.writeError(`${parsed.message}\n${usage}`);
    return EXIT_USAGE;
  }
  const options = parsed.value;
  try {
    if (options.command === "detect") return await runDetect(options, io);
    if (options.command === "diff") return await runDiff(options, io);
    if (options.command === "validate-ir") {
      if (options.files.length !== 1) return EXIT_USAGE;
      const fileName = options.files[0];
      if (fileName === undefined) return EXIT_USAGE;
      const ir = await readJsonIR(fileName, io, options.failOn);
      if (!ir) return EXIT_FATAL;
      io.writeOut("valid\n");
      return ir.exitCode;
    }
    if (options.command === "analyze" || options.command === "ir") {
      return await runPipeline(options, io);
    }
  } catch (error: unknown) {
    if (error instanceof DigestBudgetTooSmallError) {
      io.writeError(`${error.message}\n`);
      return EXIT_USAGE;
    }
    if (error instanceof RangeError) {
      io.writeError(`INTERNAL_LIMIT_EXCEEDED: ${error.message}\n`);
      return EXIT_FATAL;
    }
    if (error instanceof ExternalFrontendLimitError) {
      io.writeError(`${error.code}: ${error.message}\n`);
      return EXIT_FATAL;
    }
    if (error instanceof OutputIOError) {
      io.writeError(`IO_ERROR: ${error.message}\n`);
      return EXIT_FATAL;
    }
    const code = (error as NodeJS.ErrnoException)?.code;
    const message = error instanceof Error ? error.message : String(error);
    if (code === "ENOENT" || code === "EACCES" || code === "EISDIR") {
      io.writeError(`INPUT_UNREADABLE: ${message}\n`);
      return EXIT_FATAL;
    }
    io.writeError(`IO_ERROR: ${message}\n`);
    return EXIT_FATAL;
  }
  io.writeError(usage);
  return EXIT_USAGE;
};
