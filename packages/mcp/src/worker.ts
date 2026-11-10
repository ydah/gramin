import { parentPort, workerData } from "node:worker_threads";
import { executeTool } from "./tools.js";

try {
  parentPort?.postMessage({ text: executeTool(workerData.name, workerData.input) });
} catch (error: unknown) {
  parentPort?.postMessage({
    error: error instanceof Error ? error.message : "grammar measurement failed",
  });
}
