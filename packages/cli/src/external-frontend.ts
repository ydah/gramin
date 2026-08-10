import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

interface SpawnSpec {
  readonly command: string;
  readonly args: readonly string[];
}

const WINDOWS_PLATFORM = "win32";
const WINDOWS_SHEBANG = /^#!\s*(?<interpreter>\S+)(?:\s+(?<arguments>.*))?$/;

const resolveWindowsShebang = async (
  command: string,
  args: readonly string[],
): Promise<SpawnSpec> => {
  if (process.platform !== WINDOWS_PLATFORM) return { command, args };

  let firstLine: string;
  try {
    firstLine = (await readFile(command, "utf8")).split(/\r?\n/u, 1)[0] ?? "";
  } catch {
    return { command, args };
  }
  const match = WINDOWS_SHEBANG.exec(firstLine);
  if (!match?.groups?.interpreter) return { command, args };

  const shebangParts = [
    match.groups.interpreter,
    ...(match.groups.arguments?.trim().split(/\s+/u) ?? []),
  ];
  const envIndex = shebangParts.findIndex((part) => part.endsWith("/env"));
  const interpreterIndex = envIndex >= 0 ? envIndex + 1 : 0;
  const interpreter = shebangParts[interpreterIndex];
  if (!interpreter) return { command, args };

  const normalizedInterpreter =
    interpreter === "python3" || interpreter.endsWith("/python3") ? "python" : interpreter;
  return {
    command: normalizedInterpreter,
    args: [...shebangParts.slice(interpreterIndex + 1), command, ...args],
  };
};

export interface ExternalFrontendExecution {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ExternalFrontendOptions {
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

export class ExternalFrontendLimitError extends Error {
  constructor(
    readonly code: "FRONTEND_TIMEOUT" | "FRONTEND_OUTPUT_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "ExternalFrontendLimitError";
  }
}

export type ExternalFrontendRunner = (
  command: string,
  args: readonly string[],
  stdin: string | undefined,
  options?: ExternalFrontendOptions,
) => Promise<ExternalFrontendExecution>;

export const runExternalFrontendProcess: ExternalFrontendRunner = async (
  command,
  args,
  stdin,
  options = {},
) => {
  const spawnSpec = await resolveWindowsShebang(command, args);
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024 * 1024;
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finishResolve = (execution: ExternalFrontendExecution): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(execution);
    };
    const finishReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    };
    const append = (target: Buffer[], chunk: Buffer, stream: "stdout" | "stderr"): void => {
      const nextBytes = (stream === "stdout" ? stdoutBytes : stderrBytes) + chunk.length;
      if (nextBytes > maxOutputBytes) {
        child.kill("SIGKILL");
        finishReject(
          new ExternalFrontendLimitError(
            "FRONTEND_OUTPUT_TOO_LARGE",
            `external frontend ${stream} exceeded ${maxOutputBytes} bytes`,
          ),
        );
        return;
      }
      if (stream === "stdout") stdoutBytes = nextBytes;
      else stderrBytes = nextBytes;
      target.push(chunk);
    };
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finishReject(
        new ExternalFrontendLimitError(
          "FRONTEND_TIMEOUT",
          `external frontend exceeded timeout of ${timeoutMs} ms`,
        ),
      );
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => append(stdout, chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => append(stderr, chunk, "stderr"));
    child.once("error", (error) => finishReject(error));
    child.once("close", (exitCode) =>
      finishResolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      }),
    );
    child.stdin.end(stdin);
  });
};
