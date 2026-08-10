import { spawn } from "node:child_process";

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

export const runExternalFrontendProcess: ExternalFrontendRunner = (
  command,
  args,
  stdin,
  options = {},
) =>
  new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024 * 1024;
    const child = spawn(command, args, {
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
