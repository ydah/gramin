import type { GrammarFeatures } from "@gramin/core";
import { codeSpan } from "./code-span.js";

export interface FeatureChange {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly kind: "added" | "removed" | "changed";
}

export interface FeatureRegression extends FeatureChange {
  readonly reason: string;
}

export interface FeatureDiff {
  readonly changes: readonly FeatureChange[];
  readonly regressions: readonly FeatureRegression[];
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
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && equalValue(left[key], right[key]))
    );
  }
  return false;
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
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    [...keys].sort().forEach((key) => {
      collectChanges(before[key], after[key], `${path}/${key}`, changes);
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
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({
      path: `/diagnostics/${code}`,
      before: beforeCounts.get(code) ?? 0,
      after: count,
      kind: "added" as const,
      reason: "new warning or error diagnostics were introduced",
    }));
};

export const diffFeatures = (before: GrammarFeatures, after: GrammarFeatures): FeatureDiff => {
  const changes: FeatureChange[] = [];
  collectChanges(before, after, "", changes);
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
  return { changes, regressions };
};

export const renderFeatureDiffJson = (diff: FeatureDiff): string =>
  `${JSON.stringify(diff, null, 2)}\n`;

export const renderFeatureDiffMarkdown = (diff: FeatureDiff): string => {
  const rows = diff.changes.length
    ? diff.changes
        .map(
          (change) =>
            `| ${codeSpan(change.path)} | ${codeSpan(valueText(change.before))} | ${codeSpan(valueText(change.after))} | ${change.kind} |`,
        )
        .join("\n")
    : "| _none_ | — | — | — |";
  const regressions = diff.regressions.length
    ? diff.regressions
        .map((regression) => `- ${codeSpan(regression.path)}: ${regression.reason}`)
        .join("\n")
    : "_none_";
  return `# Grammar feature diff

| Path | Before | After | Change |
|---|---:|---:|---|
${rows}

## Regressions

${regressions}
`;
};
