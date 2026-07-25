import { readFile, writeFile } from "node:fs/promises";
import { analyzeGrammar } from "@gramin/analyzer";
import {
  canonicalize,
  type Frontend,
  type GrammarIR,
  type SourceFile,
  serializeCanonical,
  validateIR,
} from "@gramin/core";
import { bnfFrontend } from "@gramin/frontend-bnf";
import { yaccFrontend } from "@gramin/frontend-yacc";
import { renderJson, renderLlmDigest, renderMarkdown } from "@gramin/reporter";
import { type ParsedArguments, parseArguments } from "./arguments.js";
import { type ExternalFrontendRunner, runExternalFrontendProcess } from "./external-frontend.js";

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

const frontends: readonly Frontend[] = [yaccFrontend, bnfFrontend];

const usage = `Usage:
  gramin analyze <file...> [--format json|md|llm] [--frontend <id>] [--dialect <name>]
  gramin analyze <file...> --frontend-cmd <executable> [--dialect <name>]
  gramin analyze --ir <ir.json|-> [--format json|md]
  gramin ir <file...> [--frontend <id>] [--dialect <name>] [--strip-loc]
  gramin detect <file>
  gramin validate-ir <ir.json>
`;

const issueText = (code: string, path: string, message: string): string =>
  `${code} ${path}: ${message}\n`;

const readJsonIR = async (path: string, io: CliIO): Promise<GrammarIR | undefined> => {
  let input: unknown;
  try {
    const content = path === "-" ? await io.readStdin() : await io.readTextFile(path);
    input = JSON.parse(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeError(`IR_JSON_INVALID ${path}: ${message}\n`);
    return undefined;
  }
  const result = validateIR(input);
  if (result.ok) return result.value;
  result.issues.forEach((issue) => {
    io.writeError(issueText(issue.code, issue.path, issue.message));
  });
  return undefined;
};

const selectFrontend = (
  files: readonly SourceFile[],
  explicitId: string | undefined,
): Frontend | undefined => {
  if (explicitId) return frontends.find((frontend) => frontend.id === explicitId);
  const first = files[0];
  if (!first) return undefined;
  const ranked = frontends
    .map((frontend, index) => ({
      frontend,
      index,
      confidence: frontend.detect(first.name, first.content.slice(0, 4096)),
    }))
    .sort((left, right) => right.confidence - left.confidence || left.index - right.index);
  return ranked[0]?.confidence !== undefined && ranked[0].confidence >= 0.3
    ? ranked[0].frontend
    : undefined;
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
    return { ir: validation.value, exitCode: execution.exitCode };
  }
  const files = await Promise.all(
    options.files.map(async (name) => ({ name, content: await io.readTextFile(name) })),
  );
  const frontend = selectFrontend(files, options.frontend);
  if (!frontend) {
    io.writeError(
      `FORMAT_UNDETECTED: no frontend reached the 0.3 threshold${
        options.frontend ? ` or matched ${options.frontend}` : ""
      }\n`,
    );
    return undefined;
  }
  const parsed = frontend.parse(files, {
    ...(options.dialect ? { dialect: options.dialect } : {}),
  });
  if (!parsed.ir) {
    parsed.diagnostics.forEach((diagnostic) => {
      io.writeError(`${diagnostic.code}: ${diagnostic.message}\n`);
    });
    return undefined;
  }
  const validation = validateIR(parsed.ir);
  if (!validation.ok) {
    validation.issues.forEach((issue) => {
      io.writeError(issueText(issue.code, issue.path, issue.message));
    });
    return undefined;
  }
  return {
    ir: validation.value,
    exitCode: parsed.diagnostics.some((diagnostic) => diagnostic.severity === "error")
      ? EXIT_PARTIAL
      : EXIT_SUCCESS,
  };
};

const output = async (content: string, path: string | undefined, io: CliIO): Promise<void> => {
  if (path) await io.writeTextFile(path, content);
  else io.writeOut(content);
};

const runDetect = async (options: ParsedArguments, io: CliIO): Promise<number> => {
  const fileName = options.files[0];
  if (!fileName || options.files.length !== 1) return EXIT_USAGE;
  const content = await io.readTextFile(fileName);
  const candidates = frontends.map((frontend) => ({
    frontend: frontend.id,
    confidence: frontend.detect(fileName, content.slice(0, 4096)),
  }));
  await output(`${JSON.stringify({ fileName, candidates }, null, 2)}\n`, options.output, io);
  if (Math.max(...candidates.map(({ confidence }) => confidence)) >= 0.3) return EXIT_SUCCESS;
  io.writeError("FORMAT_UNDETECTED: no frontend reached the 0.3 threshold\n");
  return EXIT_FATAL;
};

const runPipeline = async (options: ParsedArguments, io: CliIO): Promise<number> => {
  if (options.irInput && options.files.length > 0) return EXIT_USAGE;
  const parsed = options.irInput
    ? { ir: await readJsonIR(options.irInput, io), exitCode: EXIT_SUCCESS }
    : await parseSourceIR(options, io);
  if (!parsed?.ir) return EXIT_FATAL;
  const ir = options.stripLocations
    ? (canonicalize(parsed.ir, { stripLocations: true }) as GrammarIR)
    : parsed.ir;

  if (options.command === "ir") {
    await output(serializeCanonical(ir), options.output, io);
    return parsed.exitCode;
  }
  const features = analyzeGrammar(ir);
  const report =
    options.format === "md"
      ? renderMarkdown(features)
      : options.format === "llm"
        ? renderLlmDigest(features, {
            ...(options.budgetChars === undefined ? {} : { budgetChars: options.budgetChars }),
          })
        : renderJson(features);
  await output(report, options.output, io);
  return parsed.exitCode;
};

export const runCli = async (argv: readonly string[], io: CliIO = defaultIO): Promise<number> => {
  const parsed = parseArguments(argv);
  if (!parsed.ok) {
    io.writeError(`${parsed.message}\n${usage}`);
    return EXIT_USAGE;
  }
  const options = parsed.value;
  try {
    if (options.command === "detect") return runDetect(options, io);
    if (options.command === "validate-ir") {
      if (options.files.length !== 1) return EXIT_USAGE;
      const fileName = options.files[0];
      if (fileName === undefined) return EXIT_USAGE;
      const ir = await readJsonIR(fileName, io);
      if (!ir) return EXIT_FATAL;
      io.writeOut("valid\n");
      return EXIT_SUCCESS;
    }
    if (options.command === "analyze" || options.command === "ir") {
      return runPipeline(options, io);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeError(`IO_ERROR: ${message}\n`);
    return EXIT_FATAL;
  }
  io.writeError(usage);
  return EXIT_USAGE;
};
