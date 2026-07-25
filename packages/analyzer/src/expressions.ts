import type { Alternative, Expr } from "@gramin/core";

export const walkExpression = (expression: Expr, visit: (node: Expr) => void): void => {
  visit(expression);
  if (expression.kind === "symbol") {
    expression.args?.forEach((argument) => {
      walkExpression(argument, visit);
    });
    return;
  }
  if (expression.kind === "seq") {
    expression.items.forEach((item) => {
      walkExpression(item, visit);
    });
    return;
  }
  if (expression.kind === "choice") {
    expression.alts.forEach((alternative) => {
      walkExpression(alternative, visit);
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
    walkExpression(expression.expr, visit);
  }
};

export const expressionRhsLength = (expression: Expr): number => {
  if (expression.kind === "midRuleAction") return 0;
  if (expression.kind === "group") return expressionRhsLength(expression.expr);
  return 1;
};

export const alternativeRhsLength = (alternative: Alternative): number =>
  alternative.items.reduce((total, item) => total + expressionRhsLength(item), 0);

export const collectReferences = (alternative: Alternative): Set<string> => {
  const references = new Set<string>();
  for (const item of alternative.items) {
    walkExpression(item, (expression) => {
      if (expression.kind === "symbol") references.add(expression.name);
    });
  }
  return references;
};

const edgeReference = (expression: Expr, direction: "first" | "last"): string | undefined => {
  if (expression.kind === "symbol") return expression.name;
  if (expression.kind === "group") return edgeReference(expression.expr, direction);
  if (expression.kind !== "seq") return undefined;
  const orderedItems = direction === "first" ? expression.items : [...expression.items].reverse();
  for (const item of orderedItems) {
    if (item.kind === "midRuleAction") continue;
    return edgeReference(item, direction);
  }
  return undefined;
};

export const alternativeEdgeReference = (
  alternative: Alternative,
  direction: "first" | "last",
): string | undefined => {
  const items = direction === "first" ? alternative.items : [...alternative.items].reverse();
  for (const item of items) {
    if (item.kind === "midRuleAction") continue;
    return edgeReference(item, direction);
  }
  return undefined;
};

export const isExpressionNullable = (
  expression: Expr,
  nullableRules: ReadonlySet<string>,
): boolean => {
  if (expression.kind === "symbol") return nullableRules.has(expression.name);
  if (
    expression.kind === "terminal" ||
    expression.kind === "charClass" ||
    expression.kind === "anyChar"
  ) {
    return false;
  }
  if (
    expression.kind === "midRuleAction" ||
    expression.kind === "opt" ||
    expression.kind === "star" ||
    expression.kind === "predicate"
  ) {
    return true;
  }
  if (expression.kind === "plus" || expression.kind === "group") {
    return isExpressionNullable(expression.expr, nullableRules);
  }
  if (expression.kind === "seq") {
    return expression.items.every((item) => isExpressionNullable(item, nullableRules));
  }
  return expression.alts.some((alternative) => isExpressionNullable(alternative, nullableRules));
};

export const isAlternativeNullable = (
  alternative: Alternative,
  nullableRules: ReadonlySet<string>,
): boolean => alternative.items.every((item) => isExpressionNullable(item, nullableRules));
