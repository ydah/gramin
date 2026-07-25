export type {
  Frontend,
  FrontendOptions,
  FrontendResult,
  SourceFile,
} from "./frontend.js";
export {
  canonicalize,
  serializeCanonical,
  type SerializationOptions,
} from "./serialization.js";
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
  validateFeatures,
  validateIR,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.js";

export const IR_VERSION = "0.2.0";
export const FEATURES_VERSION = "0.2.0";
