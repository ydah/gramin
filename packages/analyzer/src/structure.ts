import type { GrammarFeatures, GrammarIR } from "@gramin/core";
import { alternativeEdgeReference, isAlternativeNullable } from "./expressions.js";
import {
  buildDependencyGraph,
  maxCondensedDepth,
  rankFan,
  reachableRules,
  stronglyConnectedComponents,
} from "./graph.js";
import { compareBytes } from "./numbers.js";

const computeNullableRules = (ir: GrammarIR): Set<string> => {
  const nullable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of ir.rules) {
      if (nullable.has(rule.name)) continue;
      if (!rule.alternatives.some((alternative) => isAlternativeNullable(alternative, nullable))) {
        continue;
      }
      nullable.add(rule.name);
      changed = true;
    }
  }
  return nullable;
};

export interface StructureResult {
  readonly features: GrammarFeatures["structure"];
  readonly largestRecursiveMembers: readonly string[];
  readonly coreSymbols: readonly string[];
}

export const structureFeatures = (ir: GrammarIR): StructureResult => {
  const graph = buildDependencyGraph(ir);
  const components = stronglyConnectedComponents(graph);
  const recursiveComponents = components.filter((component) => component.length >= 2);
  const largestRecursive =
    [...recursiveComponents].sort(
      (left, right) =>
        right.length - left.length || compareBytes(left.join("\0"), right.join("\0")),
    )[0] ?? [];
  const reachable = reachableRules(graph, ir.startSymbols);
  const fan = rankFan(graph);
  const directLeftRecursiveRules = ir.rules.filter((rule) =>
    rule.alternatives.some(
      (alternative) => alternativeEdgeReference(alternative, "first") === rule.name,
    ),
  ).length;
  const directRightRecursiveRules = ir.rules.filter((rule) =>
    rule.alternatives.some(
      (alternative) => alternativeEdgeReference(alternative, "last") === rule.name,
    ),
  ).length;
  const nullable = ir.capabilities.orderedChoice ? undefined : computeNullableRules(ir);

  return {
    features: {
      directLeftRecursiveRules,
      directRightRecursiveRules,
      recursionSccCount: recursiveComponents.length,
      largestSccSize: {
        value: largestRecursive.length,
        members: [...largestRecursive],
      },
      maxDependencyDepth: maxCondensedDepth(graph, components, reachable),
      topFanIn: fan.in,
      topFanOut: fan.out,
      unreachableSymbols: [...graph.keys()]
        .filter((name) => !reachable.has(name))
        .sort(compareBytes),
      ...(nullable === undefined ? {} : { nullableRules: nullable.size }),
      ...(nullable === undefined
        ? {
            notApplicable: {
              nullableRules:
                "orderedChoice grammar: CFG nullability does not apply; see PEG interpretation",
            },
          }
        : {}),
    },
    largestRecursiveMembers: largestRecursive,
    coreSymbols: fan.in.filter((entry) => entry.count > 0).map((entry) => entry.symbol),
  };
};
