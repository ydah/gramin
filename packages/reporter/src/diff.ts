import {
  canonicalize,
  compareBytes,
  type Expr,
  type GrammarFeatures,
  type GrammarIR,
  mergeRulesByName,
} from "@gramin/core";
import { codeSpan, tableCodeSpan } from "./code-span.js";

export interface FeatureChange {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly kind: "added" | "removed" | "changed";
}

export interface FeatureRegression extends FeatureChange {
  readonly reason: string;
}

export interface FeatureNotComparable {
  readonly path: string;
  readonly class: "A" | "B" | "C";
  readonly reason: string;
}

export interface FeatureDiff {
  readonly changes: readonly FeatureChange[];
  readonly regressions: readonly FeatureRegression[];
  readonly notComparable?: readonly FeatureNotComparable[];
  readonly structural?: GrammarStructureDiff;
}

export interface GrammarStructureDiff {
  readonly editDistance: number;
  readonly changedRules: readonly string[];
  readonly blastRadius: {
    readonly forward: number;
    readonly reverse: number;
    readonly total: number;
    readonly rules: readonly string[];
  };
}

export interface FeatureDiffOptions {
  readonly beforeIR: GrammarIR;
  readonly afterIR: GrammarIR;
}

const REGRESSION_METRICS = new Set([
  "/size/terminals",
  "/size/nonterminals",
  "/size/rules",
  "/size/alternatives",
  "/size/unresolvedSymbols/count",
  "/size/nestedChoiceCount",
  "/size/emptyAlternatives",
  "/structure/recursionSccCount",
  "/structure/largestSccSize/value",
  "/structure/maxDependencyDepth",
  "/structure/recursiveRules/count",
  "/precedence/levels",
  "/precedence/precOverrides",
  "/actions/totalActions",
  "/actions/rulesWithActions",
  "/parseability/ll1Conflicts/total",
  "/parseability/slr/shiftReduceConflicts",
  "/parseability/slr/reduceReduceConflicts",
  "/redundancy/commonPrefixPairs",
  "/redundancy/duplicateAlternatives",
  "/redundancy/structuralCloneGroups",
  "/peg/shadowedAlternativePairs",
  "/peg/potentialShadowedAlternativePairs",
  "/operations/errorTokenUses",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const equalValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => equalValue(value, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort(compareBytes);
    const rightKeys = Object.keys(right).sort(compareBytes);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && equalValue(left[key], right[key]))
    );
  }
  return false;
};

const RULE_METRICS: Readonly<Record<string, string>> = {
  alternatives: "size/alternatives",
  rhsItems: "size/avgRhsLength",
  maxRhsItems: "size/maxRhsLength",
  maxExpressionNestingDepth: "structure/maxExpressionNestingDepth",
  fanIn: "structure/topFanIn",
  fanOut: "structure/topFanOut",
  unitRules: "parseability/unitRules",
  firstSetSize: "parseability/firstSetSize",
  followSetSize: "parseability/followSetSize",
  ll1Conflicts: "parseability/ll1Conflicts",
  slrConflictInvolvement: "parseability/slr",
  shortestDerivation: "structure/shortestDerivation",
};

const metricParts = (path: string): readonly string[] => {
  const parts = path.slice(1).split("/");
  if (parts[0] !== "perRule") return parts;
  const mapped = RULE_METRICS[parts[2] ?? ""];
  return mapped === undefined ? [] : [...mapped.split("/"), ...parts.slice(3)];
};

const comparisonClass = (parts: readonly string[]): FeatureNotComparable["class"] | undefined => {
  const [section, field] = parts;
  if (field === "notApplicable") return undefined;
  if (section === "size") return field === "nestedChoiceCount" ? "B" : "A";
  if (section === "structure") {
    return [
      "maxDependencyDepth",
      "topFanIn",
      "topFanOut",
      "unreachableSymbols",
      "unproductiveSymbols",
      "reachableRules",
      "articulationPoints",
      "bridges",
      "topBetweenness",
      "fanInGini",
      "fanInEntropy",
      "startSymbolReachability",
    ].includes(field ?? "")
      ? "A"
      : "B";
  }
  if (section === "parseability") {
    if (field === "context") return undefined;
    if (field === "declaredConflicts") return "C";
    return field === "unitRules" ? "A" : "B";
  }
  if (section === "lexicon") {
    if (field === "tokenUsage") return "A";
    return ["keywordLike", "punctuationLike", "keywordIdentifierCollisions"].includes(field ?? "")
      ? "C"
      : "B";
  }
  if (section === "redundancy") {
    if (field === "listRecursion") return "C";
    return [
      "commonPrefixPairs",
      "maxCommonPrefixLength",
      "duplicateAlternatives",
      "singleReferenceRules",
    ].includes(field ?? "")
      ? "A"
      : "B";
  }
  if (section === "actions" || section === "style") return "C";
  if (section === "operations") {
    return ["errorTokenUses", "rulesWithErrorRecovery", "recoveryRuleRatio"].includes(field ?? "")
      ? "B"
      : "C";
  }
  if (section === "peg") {
    return ["potentialShadowedAlternativePairs", "backtrackingHotspots"].includes(field ?? "")
      ? "C"
      : "B";
  }
  return section === "precedence" || section === "sugar" ? "B" : undefined;
};

const unavailableReason = (features: unknown, parts: readonly string[]): string | undefined => {
  if (!isRecord(features)) return undefined;
  const section = features[parts[0] ?? ""];
  if (!isRecord(section) || !isRecord(section.notApplicable)) return undefined;
  for (let length = parts.length; length > 1; length -= 1) {
    const reason = section.notApplicable[parts.slice(1, length).join(".")];
    if (typeof reason === "string") return reason;
  }
  return undefined;
};

const comparisonReason = (
  before: GrammarFeatures,
  after: GrammarFeatures,
  change: FeatureChange,
  parts: readonly string[],
  classification: FeatureNotComparable["class"],
): string | undefined => {
  const beforeReason = unavailableReason(before, parts);
  if (beforeReason !== undefined) return `metric is unavailable before: ${beforeReason}`;
  const afterReason = unavailableReason(after, parts);
  if (afterReason !== undefined) return `metric is unavailable after: ${afterReason}`;
  if (change.before === undefined) return "metric is unavailable before";
  if (change.after === undefined) return "metric is unavailable after";
  if (before.featuresVersion !== after.featuresVersion) return "featuresVersion differs";
  if (classification === "A") return undefined;
  if (classification === "C") {
    if (!equalValue(before.source.format, after.source.format))
      return "source format differs for class C";
    if (!equalValue(before.source.dialect, after.source.dialect))
      return "source dialect differs for class C";
  }
  if (
    parts[0] === "parseability" &&
    ["firstSetSize", "followSetSize", "ll1Conflicts", "slr"].includes(parts[1] ?? "")
  ) {
    const left = before.parseability.context;
    const right = after.parseability.context;
    if (left?.representation !== right?.representation)
      return "parseability representation differs";
    if (left !== undefined && right !== undefined) {
      if (!equalValue(left.effectiveCapabilities, right.effectiveCapabilities)) {
        return "parseability effective capabilities differ";
      }
      return equalValue(left.limits, right.limits)
        ? undefined
        : "parseability expansion limits differ";
    }
  }
  return equalValue(before.capabilities, after.capabilities)
    ? undefined
    : "source capabilities differ";
};

const containsNumber = (value: unknown): boolean => {
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.some(containsNumber);
  return isRecord(value) && Object.values(value).some(containsNumber);
};

const nodeSize = (value: unknown): number => {
  if (Array.isArray(value)) return 1 + value.reduce((sum, entry) => sum + nodeSize(entry), 0);
  if (isRecord(value)) {
    return 1 + Object.values(value).reduce<number>((sum, entry) => sum + nodeSize(entry), 0);
  }
  return 1;
};

const treeDistance = (left: unknown, right: unknown): number => {
  if (equalValue(left, right)) return 0;
  if (Array.isArray(left) && Array.isArray(right)) {
    const rows = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1));
    const firstRow = rows[0];
    if (firstRow) {
      firstRow[0] = 0;
      for (let index = 1; index <= right.length; index += 1) {
        firstRow[index] = (firstRow[index - 1] ?? 0) + nodeSize(right[index - 1]);
      }
    }
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const row = rows[leftIndex];
      const previous = rows[leftIndex - 1];
      if (!row || !previous) continue;
      row[0] = (previous[0] ?? 0) + nodeSize(left[leftIndex - 1]);
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        row[rightIndex] = Math.min(
          (previous[rightIndex] ?? 0) + nodeSize(left[leftIndex - 1]),
          (row[rightIndex - 1] ?? 0) + nodeSize(right[rightIndex - 1]),
          (previous[rightIndex - 1] ?? 0) +
            treeDistance(left[leftIndex - 1], right[rightIndex - 1]),
        );
      }
    }
    return rows[left.length]?.[right.length] ?? 0;
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].reduce((distance, key) => {
      if (!(key in left)) return distance + nodeSize(right[key]);
      if (!(key in right)) return distance + nodeSize(left[key]);
      return distance + treeDistance(left[key], right[key]);
    }, 0);
  }
  return Math.max(nodeSize(left), nodeSize(right));
};

const normalizedExpression = (expression: Expr): unknown | undefined => {
  if (expression.kind === "midRuleAction") return undefined;
  if (expression.kind === "symbol") {
    return {
      kind: expression.kind,
      name: expression.name,
      ...(expression.args === undefined
        ? {}
        : {
            args: expression.args.map(
              (argument) => normalizedExpression(argument) ?? { kind: "seq", items: [] },
            ),
          }),
    };
  }
  if (expression.kind === "seq") {
    return {
      kind: expression.kind,
      items: expression.items.flatMap((item) => {
        const normalized = normalizedExpression(item);
        return normalized === undefined ? [] : [normalized];
      }),
    };
  }
  if (expression.kind === "choice") {
    return {
      kind: expression.kind,
      ordered: expression.ordered,
      alts: expression.alts.map(
        (alternative) => normalizedExpression(alternative) ?? { kind: "seq", items: [] },
      ),
    };
  }
  if (
    expression.kind === "opt" ||
    expression.kind === "star" ||
    expression.kind === "plus" ||
    expression.kind === "group"
  ) {
    return {
      kind: expression.kind,
      expr: normalizedExpression(expression.expr) ?? { kind: "seq", items: [] },
    };
  }
  if (expression.kind === "predicate") {
    return {
      kind: expression.kind,
      positive: expression.positive,
      expr: normalizedExpression(expression.expr) ?? { kind: "seq", items: [] },
    };
  }
  return expression;
};

const normalizedRules = (ir: GrammarIR): Map<string, unknown> =>
  new Map(
    mergeRulesByName(ir.rules).map((rule) => [
      rule.name,
      canonicalize({
        ...(rule.params === undefined ? {} : { params: rule.params }),
        ...(rule.isInline === true ? { isInline: true } : {}),
        ...(rule.orderedAlternatives === true ? { orderedAlternatives: true } : {}),
        alternatives: rule.alternatives.map((alternative) => ({
          items: alternative.items.flatMap((item) => {
            const normalized = normalizedExpression(item);
            return normalized === undefined ? [] : [normalized];
          }),
          ...(alternative.precedence === undefined ? {} : { precedence: alternative.precedence }),
        })),
      }),
    ]),
  );

const collectRuleReferences = (
  expression: Expr,
  ruleNames: ReadonlySet<string>,
  boundNames: ReadonlySet<string>,
): string[] => {
  const references: string[] = [];
  const pending = [expression];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    if (current.kind === "symbol") {
      if (ruleNames.has(current.name) && !boundNames.has(current.name))
        references.push(current.name);
      if (current.args) pending.push(...current.args);
    } else if (current.kind === "seq") pending.push(...current.items);
    else if (current.kind === "choice") pending.push(...current.alts);
    else if (
      current.kind === "opt" ||
      current.kind === "star" ||
      current.kind === "plus" ||
      current.kind === "predicate" ||
      current.kind === "group"
    ) {
      pending.push(current.expr);
    }
  }
  return references;
};

const dependencyGraph = (
  ir: GrammarIR,
  allRules: ReadonlySet<string>,
): Map<string, Set<string>> => {
  const graph = new Map([...allRules].map((rule) => [rule, new Set<string>()]));
  mergeRulesByName(ir.rules).forEach((rule) => {
    const boundNames = new Set(rule.params);
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach((item) => {
        collectRuleReferences(item, allRules, boundNames).forEach((target) => {
          graph.get(rule.name)?.add(target);
        });
      });
    });
  });
  return graph;
};

const reach = (
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  starts: Iterable<string>,
): Set<string> => {
  const reached = new Set<string>();
  const pending = [...starts];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || reached.has(current)) continue;
    reached.add(current);
    (graph.get(current) ?? []).forEach((target) => {
      pending.push(target);
    });
  }
  return reached;
};

const grammarStructureDiff = (before: GrammarIR, after: GrammarIR): GrammarStructureDiff => {
  const beforeRules = normalizedRules(before);
  const afterRules = normalizedRules(after);
  const names = [...new Set([...beforeRules.keys(), ...afterRules.keys()])].sort(compareBytes);
  const changedRules = names.filter(
    (name) => !equalValue(beforeRules.get(name), afterRules.get(name)),
  );
  const editDistance = changedRules.reduce((distance, name) => {
    const left = beforeRules.get(name);
    const right = afterRules.get(name);
    if (left === undefined) return distance + nodeSize(right);
    if (right === undefined) return distance + nodeSize(left);
    return distance + treeDistance(left, right);
  }, 0);
  const allRules = new Set(names);
  const graph = dependencyGraph(before, allRules);
  dependencyGraph(after, allRules).forEach((targets, source) => {
    const combined = graph.get(source) ?? new Set<string>();
    targets.forEach((target) => {
      combined.add(target);
    });
    graph.set(source, combined);
  });
  const reverse = new Map([...allRules].map((rule) => [rule, new Set<string>()]));
  graph.forEach((targets, source) => {
    targets.forEach((target) => {
      reverse.get(target)?.add(source);
    });
  });
  const forward = reach(graph, changedRules);
  const backward = reach(reverse, changedRules);
  const affected = [...new Set([...forward, ...backward])].sort(compareBytes);
  return {
    editDistance,
    changedRules,
    blastRadius: {
      forward: forward.size,
      reverse: backward.size,
      total: affected.length,
      rules: affected,
    },
  };
};

const valueText = (value: unknown): string => {
  if (value === undefined) return "—";
  return JSON.stringify(value) ?? String(value);
};

const collectChanges = (
  before: unknown,
  after: unknown,
  path: string,
  changes: FeatureChange[],
): void => {
  if (equalValue(before, after)) return;
  const sourceRow = path.startsWith("/perRule/") && path.split("/").length === 3;
  if (
    ((isRecord(before) || isRecord(after)) && !sourceRow) ||
    (isRecord(before) && isRecord(after))
  ) {
    const left = isRecord(before) ? before : {};
    const right = isRecord(after) ? after : {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    [...keys].sort(compareBytes).forEach((key) => {
      const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
      collectChanges(
        Object.hasOwn(left, key) ? left[key] : undefined,
        Object.hasOwn(right, key) ? right[key] : undefined,
        `${path}/${escaped}`,
        changes,
      );
    });
    return;
  }
  if (Object.is(before, after)) return;
  const kind = before === undefined ? "added" : after === undefined ? "removed" : "changed";
  changes.push({ path, before, after, kind });
};

const REGRESSION_LISTS = new Set([
  "/size/unresolvedSymbols/names",
  "/structure/unreachableSymbols",
  "/structure/unproductiveSymbols",
  "/parseability/cyclicUnitRules",
  "/redundancy/undefinedPrecedenceOverrides",
  "/redundancy/unusedTerminals",
  "/redundancy/unusedPrecedenceTokens",
]);

const diagnosticRegressions = (
  before: GrammarFeatures,
  after: GrammarFeatures,
): FeatureRegression[] => {
  const beforeCounts = new Map<string, number>();
  const afterCounts = new Map<string, number>();
  before.diagnostics.forEach((diagnostic) => {
    if (diagnostic.severity !== "info") {
      beforeCounts.set(diagnostic.code, (beforeCounts.get(diagnostic.code) ?? 0) + 1);
    }
  });
  after.diagnostics.forEach((diagnostic) => {
    if (diagnostic.severity !== "info") {
      afterCounts.set(diagnostic.code, (afterCounts.get(diagnostic.code) ?? 0) + 1);
    }
  });
  return [...afterCounts]
    .filter(([code, count]) => count > (beforeCounts.get(code) ?? 0))
    .sort(([left], [right]) => compareBytes(left, right))
    .map(([code, count]) => ({
      path: `/diagnostics/${code}`,
      before: beforeCounts.get(code) ?? 0,
      after: count,
      kind: "added" as const,
      reason: "new warning or error diagnostics were introduced",
    }));
};

export const diffFeatures = (
  before: GrammarFeatures,
  after: GrammarFeatures,
  options?: FeatureDiffOptions,
): FeatureDiff => {
  const candidates: FeatureChange[] = [];
  const keyedFeatures = (features: GrammarFeatures) => ({
    ...features,
    perRule: Object.fromEntries(features.perRule.map((row) => [row.rule, row])),
  });
  collectChanges(keyedFeatures(before), keyedFeatures(after), "", candidates);
  const notComparable: FeatureNotComparable[] = [];
  const changes = candidates.filter((change) => {
    const parts = metricParts(change.path);
    const classification = comparisonClass(parts);
    if (
      classification === undefined ||
      !(
        containsNumber(change.before) ||
        containsNumber(change.after) ||
        REGRESSION_LISTS.has(change.path)
      )
    ) {
      return true;
    }
    const reason = comparisonReason(before, after, change, parts, classification);
    if (reason === undefined) return true;
    notComparable.push({ path: change.path, class: classification, reason });
    return false;
  });
  const regressions = changes
    .filter(
      (change): change is FeatureRegression =>
        REGRESSION_METRICS.has(change.path) &&
        typeof change.before === "number" &&
        typeof change.after === "number" &&
        change.after > change.before,
    )
    .map((change) => ({
      ...change,
      reason: "a tracked complexity metric increased",
    }));
  regressions.push(
    ...changes
      .filter(
        (change) =>
          REGRESSION_LISTS.has(change.path) &&
          Array.isArray(change.before) &&
          Array.isArray(change.after) &&
          change.after.length > change.before.length,
      )
      .map((change) => ({
        ...change,
        reason: "a tracked structural issue list grew",
      })),
  );
  regressions.push(...diagnosticRegressions(before, after));
  return {
    changes,
    regressions,
    ...(notComparable.length === 0 ? {} : { notComparable }),
    ...(options === undefined
      ? {}
      : { structural: grammarStructureDiff(options.beforeIR, options.afterIR) }),
  };
};

export const renderFeatureDiffJson = (diff: FeatureDiff): string =>
  `${JSON.stringify(diff, null, 2)}\n`;

export const renderFeatureDiffMarkdown = (diff: FeatureDiff): string => {
  const rows = diff.changes.length
    ? diff.changes
        .map(
          (change) =>
            `| ${tableCodeSpan(change.path)} | ${tableCodeSpan(valueText(change.before))} | ${tableCodeSpan(valueText(change.after))} | ${change.kind} |`,
        )
        .join("\n")
    : "| _none_ | — | — | — |";
  const regressions = diff.regressions.length
    ? diff.regressions
        .map((regression) => `- ${codeSpan(regression.path)}: ${regression.reason}`)
        .join("\n")
    : "_none_";
  const structural = diff.structural
    ? `## Structural change

- Tree edit distance: ${diff.structural.editDistance}
- Changed rules: ${diff.structural.changedRules.map((rule) => codeSpan(rule)).join(", ") || "_none_"}
- Blast radius: ${diff.structural.blastRadius.total} rules (${diff.structural.blastRadius.forward} forward, ${diff.structural.blastRadius.reverse} reverse)

`
    : "";
  const skipped = diff.notComparable?.length
    ? `## Not comparable\n\n${diff.notComparable
        .map(
          (entry) => `- ${codeSpan(entry.path)} (class ${entry.class}): ${codeSpan(entry.reason)}`,
        )
        .join("\n")}\n\n`
    : "";
  return `# Grammar feature diff

| Path | Before | After | Change |
|---|---:|---:|---|
${rows}

${structural}${skipped}## Regressions

${regressions}
`;
};
