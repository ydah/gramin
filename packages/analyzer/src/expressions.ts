import type { Alternative, Expr } from "@gramin/core";

export const walkExpression = (expression: Expr, visit: (node: Expr) => void): void => {
  const pending = [expression];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    visit(current);
    const children =
      current.kind === "symbol"
        ? current.args
        : current.kind === "seq"
          ? current.items
          : current.kind === "choice"
            ? current.alts
            : current.kind === "opt" ||
                current.kind === "star" ||
                current.kind === "plus" ||
                current.kind === "predicate" ||
                current.kind === "group"
              ? [current.expr]
              : undefined;
    if (!children) continue;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) pending.push(child);
    }
  }
};

export const expressionRhsLength = (expression: Expr): number => {
  let current = expression;
  while (current.kind === "group") current = current.expr;
  return current.kind === "midRuleAction" ? 0 : 1;
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
  let current = expression;
  while (true) {
    if (current.kind === "symbol") return current.name;
    if (current.kind === "group") {
      current = current.expr;
      continue;
    }
    if (current.kind !== "seq") return undefined;
    const step = direction === "first" ? 1 : -1;
    let index = direction === "first" ? 0 : current.items.length - 1;
    let nextExpression: Expr | undefined;
    while (index >= 0 && index < current.items.length) {
      const item = current.items[index];
      if (item?.kind !== "midRuleAction") {
        nextExpression = item;
        break;
      }
      index += step;
    }
    if (!nextExpression) return undefined;
    current = nextExpression;
  }
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
  type WorkItem = { readonly value: Expr; readonly expanded: boolean };
  const values = new Map<Expr, boolean>();
  const pending: WorkItem[] = [{ value: expression, expanded: false }];
  while (pending.length > 0) {
    const item = pending.pop();
    if (!item) break;
    if (!item.expanded) {
      pending.push({ ...item, expanded: true });
      const children =
        item.value.kind === "choice"
          ? item.value.alts
          : item.value.kind === "seq"
            ? item.value.items
            : item.value.kind === "plus" || item.value.kind === "group"
              ? [item.value.expr]
              : [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child) pending.push({ value: child, expanded: false });
      }
      continue;
    }
    const current = item.value;
    let result: boolean;
    if (current.kind === "symbol") result = nullableRules.has(current.name);
    else if (
      current.kind === "terminal" ||
      current.kind === "charClass" ||
      current.kind === "anyChar"
    ) {
      result = false;
    } else if (
      current.kind === "midRuleAction" ||
      current.kind === "opt" ||
      current.kind === "star" ||
      current.kind === "predicate"
    ) {
      result = true;
    } else if (current.kind === "plus" || current.kind === "group") {
      result = values.get(current.expr) === true;
    } else if (current.kind === "seq") {
      result = current.items.every((child) => values.get(child) === true);
    } else {
      result = current.alts.some((alternative) => values.get(alternative) === true);
    }
    values.set(current, result);
  }
  return values.get(expression) === true;
};

export const isAlternativeNullable = (
  alternative: Alternative,
  nullableRules: ReadonlySet<string>,
): boolean => alternative.items.every((item) => isExpressionNullable(item, nullableRules));
