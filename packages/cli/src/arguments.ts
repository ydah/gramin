export type OutputFormat = "json" | "md" | "llm";

export interface ParsedArguments {
  readonly command: string;
  readonly files: readonly string[];
  readonly format: OutputFormat;
  readonly frontend?: string;
  readonly dialect?: string;
  readonly irInput?: string;
  readonly output?: string;
  readonly stripLocations: boolean;
  readonly budgetChars?: number;
}

export type ArgumentResult =
  | { readonly ok: true; readonly value: ParsedArguments }
  | { readonly ok: false; readonly message: string };

const valueOptions = new Set([
  "--format",
  "--frontend",
  "--dialect",
  "--ir",
  "--budget-chars",
  "-o",
]);

export const parseArguments = (argv: readonly string[]): ArgumentResult => {
  const [command, ...tokens] = argv;
  if (!command) return { ok: false, message: "missing command" };
  const files: string[] = [];
  const options = new Map<string, string>();
  let stripLocations = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) break;
    if (token === "--strip-loc") {
      stripLocations = true;
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
  if (!["json", "md", "llm"].includes(format)) {
    return { ok: false, message: `unknown format ${format}` };
  }
  const budgetText = options.get("--budget-chars");
  const budgetChars = budgetText === undefined ? undefined : Number(budgetText);
  if (budgetChars !== undefined && (!Number.isSafeInteger(budgetChars) || budgetChars <= 0)) {
    return { ok: false, message: "--budget-chars must be a positive integer" };
  }
  const frontend = options.get("--frontend");
  const dialect = options.get("--dialect");
  const irInput = options.get("--ir");
  const output = options.get("-o");

  return {
    ok: true,
    value: {
      command,
      files,
      format: format as OutputFormat,
      ...(frontend === undefined ? {} : { frontend }),
      ...(dialect === undefined ? {} : { dialect }),
      ...(irInput === undefined ? {} : { irInput }),
      ...(output === undefined ? {} : { output }),
      stripLocations,
      ...(budgetChars === undefined ? {} : { budgetChars }),
    },
  };
};
