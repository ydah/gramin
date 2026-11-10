import type { Expr, GrammarFeatures, GrammarIR } from "@gramin/core";
import { isExpressionNullable, walkExpression } from "./expressions.js";
import { stronglyConnectedComponents } from "./graph.js";
import { computeNullableRules } from "./structure.js";

export interface CFGExtensionFeatures {
  readonly sugar: Pick<GrammarFeatures["sugar"], "nullableRepetitions" | "notApplicable">;
  readonly structure: Pick<
    GrammarFeatures["structure"],
    "indirectLeftRecursiveRules" | "notApplicable"
  >;
}

const addLeftCorners = (
  expression: Expr,
  ruleNames: ReadonlySet<string>,
  nullable: ReadonlySet<string>,
  targets: Set<string>,
): void => {
  const pending = [expression];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    if (current.kind === "symbol") {
      if (ruleNames.has(current.name)) targets.add(current.name);
    } else if (current.kind === "seq") {
      for (const item of current.items) {
        pending.push(item);
        if (!isExpressionNullable(item, nullable)) break;
      }
    } else if (current.kind === "choice") {
      current.alts.forEach((alternative) => {
        pending.push(alternative);
      });
    } else if (
      current.kind === "group" ||
      current.kind === "opt" ||
      current.kind === "star" ||
      current.kind === "plus"
    ) {
      pending.push(current.expr);
    }
  }
};

export const cfgExtensionFeatures = (ir: GrammarIR): CFGExtensionFeatures => {
  const capabilityReason = ir.capabilities.orderedChoice
    ? "orderedChoice grammar: source CFG nullable repetitions and indirect left recursion do not apply"
    : ir.capabilities.predicates
      ? "predicates grammar: source CFG nullable repetitions and indirect left recursion do not apply"
      : ir.capabilities.parameterizedRules
        ? "parameterizedRules grammar: concrete expansion does not preserve these source CFG measurements"
        : undefined;
  if (capabilityReason !== undefined) {
    return {
      sugar: { notApplicable: { nullableRepetitions: capabilityReason } },
      structure: { notApplicable: { indirectLeftRecursiveRules: capabilityReason } },
    };
  }

  const ruleNames = new Set(ir.rules.map((rule) => rule.name));
  const terminalNames = new Set([
    ...ir.terminals.flatMap((terminal) => (terminal.name === undefined ? [] : [terminal.name])),
    ...ir.externalSymbols
      .filter((symbol) => symbol.kind === "terminal")
      .map((symbol) => symbol.name),
  ]);
  const repetitionOperands: Expr[] = [];
  let hasUndefinedRule = false;
  ir.rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach((item) => {
        walkExpression(item, (expression) => {
          if (expression.kind === "star" || expression.kind === "plus") {
            repetitionOperands.push(expression.expr);
          }
          if (
            expression.kind === "symbol" &&
            !ruleNames.has(expression.name) &&
            !terminalNames.has(expression.name)
          ) {
            hasUndefinedRule = true;
          }
        });
      });
    });
  });
  if (hasUndefinedRule) {
    const reason =
      "undefined rule reference: external or unresolved rule nullability and left corners are unknown";
    return {
      sugar:
        repetitionOperands.length === 0
          ? { nullableRepetitions: 0 }
          : { notApplicable: { nullableRepetitions: reason } },
      structure: { notApplicable: { indirectLeftRecursiveRules: reason } },
    };
  }

  const nullable = computeNullableRules(ir);
  const graph = new Map<string, Set<string>>();
  ir.rules.forEach((rule) => {
    const targets = graph.get(rule.name) ?? new Set<string>();
    rule.alternatives.forEach((alternative) => {
      addLeftCorners({ kind: "seq", items: alternative.items }, ruleNames, nullable, targets);
    });
    graph.set(rule.name, targets);
  });
  return {
    sugar: {
      nullableRepetitions: repetitionOperands.filter((operand) =>
        isExpressionNullable(operand, nullable),
      ).length,
    },
    structure: {
      indirectLeftRecursiveRules: stronglyConnectedComponents(graph)
        .filter((component) => component.length >= 2)
        .reduce((total, component) => total + component.length, 0),
    },
  };
};
