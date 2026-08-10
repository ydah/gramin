import { analyzeRequest } from "./pipeline";
import type { AnalyzeRequest } from "./types";

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  self.postMessage(analyzeRequest(event.data));
};
