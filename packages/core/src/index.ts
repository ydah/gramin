export type {
  Frontend,
  FrontendOptions,
  FrontendResult,
  SourceFile,
} from "./frontend.js";
export { DEFAULT_MAX_NESTING_DEPTH, MAX_SUPPORTED_NESTING_DEPTH } from "./frontend.js";
export { compareBytes } from "./ordering.js";
export { mergeRulesByName } from "./rules.js";
export {
  GrammarFeaturesSchemaDocument,
  GrammarIRSchemaDocument,
} from "./schema-documents.js";
export {
  type GrammarFeatures,
  GrammarFeaturesSchema,
  type NotApplicable,
} from "./schemas/features.js";
export {
  type Alternative,
  type Capabilities,
  CapabilitiesSchema,
  type Diagnostic,
  type Expr,
  ExprSchema,
  type GrammarIR,
  GrammarIRSchema,
  type Rule,
  type SourceSpan,
  type TerminalDecl,
} from "./schemas/ir.js";
export {
  canonicalize,
  type SerializationOptions,
  serializeCanonical,
} from "./serialization.js";
export {
  type ValidationIssue,
  type ValidationResult,
  validateFeatures,
  validateIR,
} from "./validation.js";

export const IR_VERSION = "1.2.0";
export const FEATURES_VERSION = "0.4.0";
