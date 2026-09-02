export {
  diffFeatures,
  type FeatureChange,
  type FeatureDiff,
  type FeatureDiffOptions,
  type FeatureRegression,
  type GrammarStructureDiff,
  renderFeatureDiffJson,
  renderFeatureDiffMarkdown,
} from "./diff.js";
export { renderJson } from "./json.js";
export {
  DigestBudgetTooSmallError,
  type LlmDigestOptions,
  renderLlmDigest,
} from "./llm.js";
export { renderMarkdown } from "./markdown.js";
export { renderSarif } from "./sarif.js";

export const REPORTER_VERSION = "0.2.0";
