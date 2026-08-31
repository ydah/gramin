import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { type GrammarFeatures, GrammarFeaturesSchema } from "./schemas/features.js";
import { type Expr, type GrammarIR, GrammarIRSchema } from "./schemas/ir.js";
import { MAX_SUPPORTED_NESTING_DEPTH } from "./frontend.js";

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const irAjv = new Ajv2020({ allErrors: false, strict: true });
const featuresAjv = new Ajv2020({ allErrors: true, strict: true });
let validateIRShape: ValidateFunction<GrammarIR> | undefined;
let validateFeaturesShape: ValidateFunction<GrammarFeatures> | undefined;

const getIRValidator = (): ValidateFunction<GrammarIR> =>
  (validateIRShape ??= irAjv.compile(GrammarIRSchema) as ValidateFunction<GrammarIR>);

const getFeaturesValidator = (): ValidateFunction<GrammarFeatures> =>
  (validateFeaturesShape ??= featuresAjv.compile(
    GrammarFeaturesSchema,
  ) as ValidateFunction<GrammarFeatures>);

const mapSchemaIssues = (errors: ErrorObject[] | null | undefined): ValidationIssue[] =>
  (errors ?? []).map((error) => ({
    code: "SCHEMA_INVALID",
    path: error.instancePath || "/",
    message: error.message ?? "schema validation failed",
  }));

const nestingIssue = (input: unknown): ValidationIssue | undefined => {
  if (typeof input !== "object" || input === null || !("rules" in input)) return undefined;
  const rules = Array.isArray(input.rules) ? input.rules : [];
  const pending: { value: unknown; path: string; depth: number }[] = [];
  rules.forEach((rule, ruleIndex) => {
    if (typeof rule !== "object" || rule === null || !("alternatives" in rule)) return;
    const alternatives = Array.isArray(rule.alternatives) ? rule.alternatives : [];
    alternatives.forEach((alternative: unknown, alternativeIndex: number) => {
      if (typeof alternative !== "object" || alternative === null || !("items" in alternative)) {
        return;
      }
      const items = Array.isArray(alternative.items) ? alternative.items : [];
      items.forEach((value: unknown, itemIndex: number) => {
        pending.push({
          value,
          path: `/rules/${ruleIndex}/alternatives/${alternativeIndex}/items/${itemIndex}`,
          depth: 1,
        });
      });
    });
  });
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    if (current.depth > MAX_SUPPORTED_NESTING_DEPTH) {
      return {
        code: "IR_NESTING_TOO_DEEP",
        path: current.path,
        message: `maximum expression nesting depth ${MAX_SUPPORTED_NESTING_DEPTH} exceeded`,
      };
    }
    if (typeof current.value !== "object" || current.value === null || !("kind" in current.value)) {
      continue;
    }
    const node = current.value as Readonly<Record<string, unknown>>;
    const children: readonly (readonly [unknown, string])[] =
      node.kind === "symbol"
        ? Array.isArray(node.args)
          ? node.args.map((value, index) => [value, `/args/${index}`] as const)
          : []
        : node.kind === "seq"
          ? Array.isArray(node.items)
            ? node.items.map((value, index) => [value, `/items/${index}`] as const)
            : []
          : node.kind === "choice"
            ? Array.isArray(node.alts)
              ? node.alts.map((value, index) => [value, `/alts/${index}`] as const)
              : []
            : node.kind === "opt" ||
                node.kind === "star" ||
                node.kind === "plus" ||
                node.kind === "predicate" ||
                node.kind === "group"
              ? [[node.expr, "/expr"]]
              : [];
    children.forEach(([value, suffix]) => {
      pending.push({
        value,
        path: `${current.path}${suffix}`,
        depth: current.depth + 1,
      });
    });
  }
  return undefined;
};

interface CanonicalState {
  hasEbnfSugar: boolean;
  hasOrderedChoice: boolean;
  hasParameterizedRules: boolean;
  hasPredicates: boolean;
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
  const pending: {
    expression: Expr;
    path: string;
    parentKind: Expr["kind"] | "alternative";
  }[] = [{ expression, path, parentKind }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    const { expression: node, path: nodePath, parentKind: nodeParentKind } = current;
    if (node.kind === "opt" || node.kind === "star" || node.kind === "plus") {
      state.hasEbnfSugar = true;
    }
    if (node.kind === "predicate") state.hasPredicates = true;
    if (nodeParentKind === "alternative" && node.kind === "choice") {
      addIssue(
        state,
        "IR_CANON_TOP_LEVEL_CHOICE",
        nodePath,
        "top-level choices must be flattened into Rule.alternatives",
      );
    }
    if (nodeParentKind === "alternative" && node.kind === "seq") {
      addIssue(
        state,
        "IR_CANON_TOP_LEVEL_SEQ",
        nodePath,
        "Alternative.items is already an implicit sequence",
      );
    }
    if (nodeParentKind === "alternative" && node.kind === "group" && node.expr.kind !== "choice") {
      addIssue(
        state,
        "IR_CANON_TOP_LEVEL_GROUP",
        nodePath,
        "a top-level group must directly preserve a nested choice",
      );
    }
    if (nodeParentKind === "seq" && node.kind === "seq") {
      addIssue(state, "IR_CANON_NESTED_SEQ", nodePath, "nested sequences must be flattened");
    }
    if (node.kind === "choice") {
      if (node.ordered) state.hasOrderedChoice = true;
      for (let index = node.alts.length - 1; index >= 0; index -= 1) {
        const alternative = node.alts[index];
        if (alternative) {
          pending.push({
            expression: alternative,
            path: `${nodePath}/alts/${index}`,
            parentKind: "choice",
          });
        }
      }
      continue;
    }
    if (node.kind === "seq") {
      for (let index = node.items.length - 1; index >= 0; index -= 1) {
        const item = node.items[index];
        if (item) {
          pending.push({
            expression: item,
            path: `${nodePath}/items/${index}`,
            parentKind: "seq",
          });
        }
      }
      continue;
    }
    if (
      node.kind === "opt" ||
      node.kind === "star" ||
      node.kind === "plus" ||
      node.kind === "predicate" ||
      node.kind === "group"
    ) {
      pending.push({ expression: node.expr, path: `${nodePath}/expr`, parentKind: node.kind });
      continue;
    }
    if (node.kind === "symbol" && node.args) {
      state.hasParameterizedRules = true;
      for (let index = node.args.length - 1; index >= 0; index -= 1) {
        const argument = node.args[index];
        if (argument) {
          pending.push({
            expression: argument,
            path: `${nodePath}/args/${index}`,
            parentKind: "symbol",
          });
        }
      }
      continue;
    }
    if (node.kind === "charClass" || node.kind === "anyChar") state.hasScannerlessNode = true;
  }
};

const inspectCanonicalForm = (ir: GrammarIR): ValidationIssue[] => {
  const state: CanonicalState = {
    hasEbnfSugar: false,
    hasOrderedChoice: ir.rules.some((rule) => rule.orderedAlternatives === true),
    hasParameterizedRules: ir.rules.some((rule) => rule.params !== undefined),
    hasPredicates: false,
    hasScannerlessNode: false,
    issues: [],
  };

  const seenRuleNames = new Set<string>();
  ir.rules.forEach((rule, ruleIndex) => {
    if (seenRuleNames.has(rule.name)) {
      addIssue(
        state,
        "IR_CANON_DUPLICATE_RULE",
        `/rules/${ruleIndex}/name`,
        "rule names must be unique; merge alternatives of a repeated LHS",
      );
    }
    seenRuleNames.add(rule.name);
  });
  ir.startSymbols.forEach((startSymbol, index) => {
    if (seenRuleNames.has(startSymbol)) return;
    addIssue(
      state,
      "IR_CANON_START_SYMBOL",
      `/startSymbols/${index}`,
      "start symbols must name a grammar rule",
    );
  });

  const sourceMetrics = ir.sourceMetrics;
  if (
    sourceMetrics?.comments !== undefined &&
    sourceMetrics.comments.characters > sourceMetrics.sourceCharacters
  ) {
    addIssue(
      state,
      "IR_CANON_SOURCE_COMMENT_SIZE",
      "/sourceMetrics/comments/characters",
      "comment characters cannot exceed source characters",
    );
  }
  sourceMetrics?.comments?.documentedRules.forEach((ruleName, index) => {
    if (seenRuleNames.has(ruleName)) return;
    addIssue(
      state,
      "IR_CANON_DOCUMENTED_RULE",
      `/sourceMetrics/comments/documentedRules/${index}`,
      "documentedRules entries must name a grammar rule",
    );
  });
  if (sourceMetrics?.explicitEmptyAlternatives !== undefined) {
    const emptyAlternatives = ir.rules.reduce(
      (total, rule) =>
        total +
        rule.alternatives.filter((alternative) =>
          alternative.items.every((item) => item.kind === "midRuleAction"),
        ).length,
      0,
    );
    if (sourceMetrics.explicitEmptyAlternatives > emptyAlternatives) {
      addIssue(
        state,
        "IR_CANON_EXPLICIT_EMPTY_COUNT",
        "/sourceMetrics/explicitEmptyAlternatives",
        "explicit empty alternatives cannot exceed empty alternatives",
      );
    }
  }

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
  if (state.hasEbnfSugar !== ir.capabilities.ebnfSugar) {
    addIssue(
      state,
      "IR_CANON_EBNF_SUGAR_CAPABILITY",
      "/capabilities/ebnfSugar",
      "ebnfSugar must exactly reflect opt, star, or plus nodes",
    );
  }
  if (state.hasPredicates !== ir.capabilities.predicates) {
    addIssue(
      state,
      "IR_CANON_PREDICATES_CAPABILITY",
      "/capabilities/predicates",
      "predicates must exactly reflect predicate nodes",
    );
  }
  if (state.hasParameterizedRules !== ir.capabilities.parameterizedRules) {
    addIssue(
      state,
      "IR_CANON_PARAMETERIZED_RULES_CAPABILITY",
      "/capabilities/parameterizedRules",
      "parameterizedRules must exactly reflect rule parameters or symbol arguments",
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
  const tooDeep = nestingIssue(input);
  if (tooDeep) return { ok: false, issues: [tooDeep] };
  const validator = getIRValidator();
  if (!validator(input)) {
    return { ok: false, issues: mapSchemaIssues(validator.errors) };
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
  const validator = getFeaturesValidator();
  if (!validator(input)) {
    return { ok: false, issues: mapSchemaIssues(validator.errors) };
  }
  return { ok: true, value: input, issues: [] };
};
