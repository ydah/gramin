import { Worker } from "node:worker_threads";
import { MCP_LIMITS, validatePayload } from "./tools.js";

interface ExecutionOptions {
  readonly timeoutMs?: number;
  readonly workerUrl?: URL;
  readonly rssLimitBytes?: number;
  readonly signal?: AbortSignal;
}

export const runIsolated = async (
  name: string,
  input: unknown,
  options: ExecutionOptions = {},
): Promise<string> => {
  validatePayload(input);
  if (options.signal?.aborted) throw new Error("grammar request cancelled");
  const initialRss = process.memoryUsage.rss();
  return new Promise((resolve, reject) => {
    const worker = new Worker(options.workerUrl ?? new URL("./worker.js", import.meta.url), {
      workerData: { name, input },
      execArgv: [],
      stdout: true,
      stderr: true,
      resourceLimits: {
        maxOldGenerationSizeMb: MCP_LIMITS.heapMb,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
    });
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (error?: Error, text?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(memoryTimer);
      options.signal?.removeEventListener("abort", abort);
      void worker.terminate().then(
        () => {
          if (error) reject(error);
          else resolve(text ?? "");
        },
        () => reject(new Error("grammar worker could not terminate")),
      );
    };
    const timer = setTimeout(
      () => finish(new Error("grammar worker deadline exceeded")),
      options.timeoutMs ?? MCP_LIMITS.timeoutMs,
    );
    const memoryTimer = setInterval(() => {
      if (
        process.memoryUsage.rss() - initialRss >
        (options.rssLimitBytes ?? MCP_LIMITS.rssGrowthBytes)
      )
        finish(new Error("grammar worker memory growth limit exceeded"));
    }, 25);
    const abort = (): void => finish(new Error("grammar request cancelled"));
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.once("message", (result: unknown) => {
      if (
        result !== null &&
        typeof result === "object" &&
        "text" in result &&
        typeof result.text === "string" &&
        Buffer.byteLength(result.text, "utf8") <= MCP_LIMITS.outputBytes
      )
        finish(undefined, result.text);
      else if (
        result !== null &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
      )
        finish(new Error(result.error));
      else finish(new Error("invalid grammar worker response"));
    });
    worker.once("error", () => finish(new Error("grammar worker failed")));
    worker.once("exit", () => finish(new Error("grammar worker exited before returning a result")));
  });
};
