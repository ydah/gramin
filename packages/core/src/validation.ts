import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { type GrammarFeatures, GrammarFeaturesSchema } from "./schemas/features.js";
import { type Expr, type GrammarIR, GrammarIRSchema } from "./schemas/ir.js";

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateIRShape = ajv.compile(GrammarIRSchema) as ValidateFunction<GrammarIR>;
const validateFeaturesShape = ajv.compile(
  GrammarFeaturesSchema,
) as ValidateFunction<GrammarFeatures>;

const mapSchemaIssues = (errors: ErrorObject[] | null | undefined): ValidationIssue[] =>
  (errors ?? []).map((error) => ({
    code: "SCHEMA_INVALID",
    path: error.instancePath || "/",
    message: error.message ?? "schema validation failed",
  }));

interface CanonicalState {
  hasOrderedChoice: boolean;
  hasScannerlessNode: boolean;
  issues: ValidationIssue[];
}

const addIssue = (state: CanonicalState, code: string, path: string, message: string): void => {
  state.issues.push({ code, path, message });
};

const walkExpression = (
  expression: Expr,
  path: string,
  state: CanonicalState,
  parentKind: Expr["kind"] | "alternative",
): void => {
  if (parentKind === "alternative" && expression.kind === "choice") {
    addIssue(
      state,
      "IR_CANON_TOP_LEVEL_CHOICE",
      path,
      "top-level choices must be flattened into Rule.alternatives",
    );
  }
  if (parentKind === "alternative" && expression.kind === "seq") {
    addIssue(
      state,
      "IR_CANON_TOP_LEVEL_SEQ",
      path,
      "Alternative.items is already an implicit sequence",
    );
  }
  if (parentKind === "alternative" && expression.kind === "group") {
    addIssue(
      state,
      "IR_CANON_TOP_LEVEL_GROUP",
      path,
      "groups are only valid inside another expression",
    );
  }
  if (parentKind === "seq" && expression.kind === "seq") {
    addIssue(state, "IR_CANON_NESTED_SEQ", path, "nested sequences must be flattened");
  }

  if (expression.kind === "choice") {
    if (expression.ordered) state.hasOrderedChoice = true;
    expression.alts.forEach((alternative, index) => {
      walkExpression(alternative, `${path}/alts/${index}`, state, "choice");
    });
    return;
  }

  if (expression.kind === "seq") {
    expression.items.forEach((item, index) => {
      walkExpression(item, `${path}/items/${index}`, state, "seq");
    });
    return;
  }

  if (
    expression.kind === "opt" ||
    expression.kind === "star" ||
    expression.kind === "plus" ||
    expression.kind === "predicate" ||
    expression.kind === "group"
  ) {
    walkExpression(expression.expr, `${path}/expr`, state, expression.kind);
    return;
  }

  if (expression.kind === "symbol" && expression.args) {
    expression.args.forEach((argument, index) => {
      walkExpression(argument, `${path}/args/${index}`, state, "symbol");
    });
    return;
  }

  if (expression.kind === "charClass" || expression.kind === "anyChar") {
    state.hasScannerlessNode = true;
  }
};

const inspectCanonicalForm = (ir: GrammarIR): ValidationIssue[] => {
  const state: CanonicalState = {
    hasOrderedChoice: ir.rules.some((rule) => rule.orderedAlternatives === true),
    hasScannerlessNode: false,
    issues: [],
  };

  ir.rules.forEach((rule, ruleIndex) => {
    rule.alternatives.forEach((alternative, alternativeIndex) => {
      alternative.items.forEach((item, itemIndex) => {
        walkExpression(
          item,
          `/rules/${ruleIndex}/alternatives/${alternativeIndex}/items/${itemIndex}`,
          state,
          "alternative",
        );
      });
    });
  });

  if (state.hasOrderedChoice !== ir.capabilities.orderedChoice) {
    addIssue(
      state,
      "IR_CANON_ORDERED_CHOICE_CAPABILITY",
      "/capabilities/orderedChoice",
      "orderedChoice must exactly reflect ordered choice nodes",
    );
  }
  if (state.hasScannerlessNode !== ir.capabilities.scannerless) {
    addIssue(
      state,
      "IR_CANON_SCANNERLESS_CAPABILITY",
      "/capabilities/scannerless",
      "scannerless must exactly reflect charClass or anyChar nodes",
    );
  }

  return state.issues;
};

export const validateIR = (input: unknown): ValidationResult<GrammarIR> => {
  if (!validateIRShape(input)) {
    return { ok: false, issues: mapSchemaIssues(validateIRShape.errors) };
  }

  const major = Number(input.irVersion.split(".", 1)[0]);
  const issues =
    major === 0 || major === 1
      ? inspectCanonicalForm(input)
      : [
          {
            code: "IR_VERSION_UNSUPPORTED",
            path: "/irVersion",
            message: `unsupported Grammar IR major version ${input.irVersion}`,
          },
        ];
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input, issues: [] };
};

export const validateFeatures = (input: unknown): ValidationResult<GrammarFeatures> => {
  if (!validateFeaturesShape(input)) {
    return { ok: false, issues: mapSchemaIssues(validateFeaturesShape.errors) };
  }
  return { ok: true, value: input, issues: [] };
};
