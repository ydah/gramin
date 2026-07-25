import { spawn } from "node:child_process";

export interface ExternalFrontendExecution {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type ExternalFrontendRunner = (
  command: string,
  args: readonly string[],
  stdin: string | undefined,
) => Promise<ExternalFrontendExecution>;

export const runExternalFrontendProcess: ExternalFrontendRunner = (command, args, stdin) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.stdin.end(stdin);
  });
