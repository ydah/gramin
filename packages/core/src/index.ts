export type {
  Frontend,
  FrontendOptions,
  FrontendResult,
  SourceFile,
} from "./frontend.js";
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

export const IR_VERSION = "1.1.0";
export const FEATURES_VERSION = "0.2.0";
