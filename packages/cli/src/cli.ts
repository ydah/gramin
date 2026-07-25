import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { validateIR } from "@gramin/core";

export const EXIT_SUCCESS = 0;
export const EXIT_PARTIAL = 1;
export const EXIT_FATAL = 2;
export const EXIT_USAGE = 3;

export interface CliIO {
  readonly readTextFile: (path: string) => Promise<string>;
  readonly writeOut: (text: string) => void;
  readonly writeError: (text: string) => void;
}

const defaultIO: CliIO = {
  readTextFile: (path) => readFile(path, "utf8"),
  writeOut: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
};

interface Detection {
  readonly frontend: string;
  readonly confidence: number;
}

const detectByExtension = (fileName: string): Detection[] => {
  const extension = extname(fileName).toLowerCase();
  const yaccConfidence = extension === ".y" || extension === ".yy" ? 0.7 : 0;
  return [{ frontend: "yacc-family", confidence: yaccConfidence }];
};

const writeIssues = (
  issues: readonly { code: string; path: string; message: string }[],
  io: CliIO,
): void => {
  for (const issue of issues) {
    io.writeError(`${issue.code} ${issue.path}: ${issue.message}\n`);
  }
};

const validateIRFile = async (fileName: string, io: CliIO): Promise<number> => {
  let input: unknown;
  try {
    input = JSON.parse(await io.readTextFile(fileName));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeError(`IR_JSON_INVALID ${fileName}: ${message}\n`);
    return EXIT_FATAL;
  }

  const result = validateIR(input);
  if (!result.ok) {
    writeIssues(result.issues, io);
    return EXIT_FATAL;
  }
  io.writeOut("valid\n");
  return EXIT_SUCCESS;
};

const detectFile = (fileName: string, io: CliIO): number => {
  const candidates = detectByExtension(fileName);
  const selected = candidates[0];
  io.writeOut(`${JSON.stringify({ fileName, candidates }, null, 2)}\n`);
  if (!selected || selected.confidence < 0.3) {
    io.writeError(`FORMAT_UNDETECTED: no frontend reached the 0.3 threshold\n`);
    return EXIT_FATAL;
  }
  return EXIT_SUCCESS;
};

const usage = `Usage:
  gramin validate-ir <ir.json>
  gramin detect <file>
`;

export const runCli = async (argv: readonly string[], io: CliIO = defaultIO): Promise<number> => {
  const [command, operand, ...rest] = argv;
  if (!command || !operand || rest.length > 0) {
    io.writeError(usage);
    return EXIT_USAGE;
  }

  if (command === "validate-ir") return validateIRFile(operand, io);
  if (command === "detect") return detectFile(operand, io);

  io.writeError(usage);
  return EXIT_USAGE;
};
