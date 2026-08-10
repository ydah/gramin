import { MAX_SUPPORTED_NESTING_DEPTH } from "@gramin/core";

export type OutputFormat = "json" | "md" | "llm" | "sarif";
export type FailOn = "error" | "warning" | "none";

export interface ParsedArguments {
  readonly command: string;
  readonly files: readonly string[];
  readonly format: OutputFormat;
  readonly frontend?: string;
  readonly frontendCommand?: string;
  readonly dialect?: string;
  readonly irInput?: string;
  readonly output?: string;
  readonly stripLocations: boolean;
  readonly budgetChars?: number;
  readonly failOn: FailOn;
  readonly frontendTimeoutMs?: number;
  readonly maxNestingDepth?: number;
  readonly sourceName?: string;
  readonly sourceRoot?: string;
  readonly baseline?: string;
  readonly failOnRegression: boolean;
}

export type ArgumentResult =
  | { readonly ok: true; readonly value: ParsedArguments }
  | { readonly ok: false; readonly message: string };

const valueOptions = new Set([
  "--format",
  "--frontend",
  "--frontend-cmd",
  "--dialect",
  "--ir",
  "--budget-chars",
  "--fail-on",
  "--frontend-timeout",
  "--max-nesting-depth",
  "--source-name",
  "--source-root",
  "--baseline",
  "-o",
]);

export const parseArguments = (argv: readonly string[]): ArgumentResult => {
  const [command, ...tokens] = argv;
  if (!command) return { ok: false, message: "missing command" };
  const files: string[] = [];
  const options = new Map<string, string>();
  let stripLocations = false;
  let failOnRegression = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) break;
    if (token === "--strip-loc") {
      stripLocations = true;
      continue;
    }
    if (token === "--fail-on-regression") {
      failOnRegression = true;
      continue;
    }
    if (valueOptions.has(token)) {
      const value = tokens[index + 1];
      if (value === undefined) return { ok: false, message: `missing value for ${token}` };
      options.set(token, value);
      index += 1;
      continue;
    }
    if (token.startsWith("-") && token !== "-") {
      return { ok: false, message: `unknown option ${token}` };
    }
    files.push(token);
  }

  const format = options.get("--format") ?? "json";
  if (!["json", "md", "llm", "sarif"].includes(format)) {
    return { ok: false, message: `unknown format ${format}` };
  }
  const budgetText = options.get("--budget-chars");
  const budgetChars = budgetText === undefined ? undefined : Number(budgetText);
  if (budgetChars !== undefined && (!Number.isSafeInteger(budgetChars) || budgetChars <= 0)) {
    return { ok: false, message: "--budget-chars must be a positive integer" };
  }
  const frontendTimeoutText = options.get("--frontend-timeout");
  const frontendTimeoutMs =
    frontendTimeoutText === undefined ? undefined : Number(frontendTimeoutText);
  if (
    frontendTimeoutMs !== undefined &&
    (!Number.isSafeInteger(frontendTimeoutMs) || frontendTimeoutMs <= 0)
  ) {
    return { ok: false, message: "--frontend-timeout must be a positive integer" };
  }
  const maxNestingDepthText = options.get("--max-nesting-depth");
  const maxNestingDepth =
    maxNestingDepthText === undefined ? undefined : Number(maxNestingDepthText);
  if (
    maxNestingDepth !== undefined &&
    (!Number.isSafeInteger(maxNestingDepth) || maxNestingDepth <= 0)
  ) {
    return { ok: false, message: "--max-nesting-depth must be a positive integer" };
  }
  if (maxNestingDepth !== undefined && maxNestingDepth > MAX_SUPPORTED_NESTING_DEPTH) {
    return {
      ok: false,
      message: `--max-nesting-depth must be at most ${MAX_SUPPORTED_NESTING_DEPTH}`,
    };
  }
  const failOn = options.get("--fail-on") ?? "error";
  if (!(["error", "warning", "none"] as const).includes(failOn as FailOn)) {
    return { ok: false, message: `unknown --fail-on threshold ${failOn}` };
  }
  const frontend = options.get("--frontend");
  const frontendCommand = options.get("--frontend-cmd");
  if (frontend !== undefined && frontendCommand !== undefined) {
    return { ok: false, message: "--frontend and --frontend-cmd cannot be used together" };
  }
  const dialect = options.get("--dialect");
  const irInput = options.get("--ir");
  const output = options.get("-o");
  const sourceName = options.get("--source-name");
  if (sourceName !== undefined && sourceName.length === 0) {
    return { ok: false, message: "--source-name must not be empty" };
  }
  const sourceRoot = options.get("--source-root");
  if (sourceRoot !== undefined && sourceRoot.length === 0) {
    return { ok: false, message: "--source-root must not be empty" };
  }
  if (sourceName !== undefined && files.length > 1) {
    return {
      ok: false,
      message: "--source-name accepts one input; use --source-root for multiple files",
    };
  }
  const baseline = options.get("--baseline");

  return {
    ok: true,
    value: {
      command,
      files,
      format: format as OutputFormat,
      ...(frontend === undefined ? {} : { frontend }),
      ...(frontendCommand === undefined ? {} : { frontendCommand }),
      ...(dialect === undefined ? {} : { dialect }),
      ...(irInput === undefined ? {} : { irInput }),
      ...(output === undefined ? {} : { output }),
      stripLocations,
      ...(budgetChars === undefined ? {} : { budgetChars }),
      failOn: failOn as FailOn,
      ...(frontendTimeoutMs === undefined ? {} : { frontendTimeoutMs }),
      ...(maxNestingDepth === undefined ? {} : { maxNestingDepth }),
      ...(sourceName === undefined ? {} : { sourceName }),
      ...(sourceRoot === undefined ? {} : { sourceRoot }),
      ...(baseline === undefined ? {} : { baseline }),
      failOnRegression,
    },
  };
};
