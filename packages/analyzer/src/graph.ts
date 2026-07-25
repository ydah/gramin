import type { GrammarIR } from "@gramin/core";
import { collectReferences } from "./expressions.js";

export type DependencyGraph = ReadonlyMap<string, ReadonlySet<string>>;

const required = <K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V => {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing ${label} for graph node`);
  return value;
};

const compareBytes = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

export const buildDependencyGraph = (ir: GrammarIR): DependencyGraph => {
  const ruleNames = new Set(ir.rules.map((rule) => rule.name));
  return new Map(
    ir.rules.map((rule) => {
      const references = new Set<string>();
      for (const alternative of rule.alternatives) {
        for (const reference of collectReferences(alternative)) {
          if (ruleNames.has(reference)) references.add(reference);
        }
      }
      return [rule.name, references] as const;
    }),
  );
};

export const stronglyConnectedComponents = (graph: DependencyGraph): string[][] => {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const connect = (node: string): void => {
    const index = nextIndex;
    nextIndex += 1;
    indices.set(node, index);
    lowLinks.set(node, index);
    stack.push(node);
    onStack.add(node);

    for (const neighbor of graph.get(node) ?? []) {
      if (!indices.has(neighbor)) {
        connect(neighbor);
        lowLinks.set(
          node,
          Math.min(
            required(lowLinks, node, "low link"),
            required(lowLinks, neighbor, "neighbor low link"),
          ),
        );
      } else if (onStack.has(neighbor)) {
        lowLinks.set(
          node,
          Math.min(
            required(lowLinks, node, "low link"),
            required(indices, neighbor, "neighbor index"),
          ),
        );
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    components.push(component.sort(compareBytes));
  };

  [...graph.keys()].sort(compareBytes).forEach((node) => {
    if (!indices.has(node)) connect(node);
  });
  return components;
};

export const reachableRules = (
  graph: DependencyGraph,
  startSymbols: readonly string[],
): Set<string> => {
  const reachable = new Set<string>();
  const pending = [...startSymbols].filter((symbol) => graph.has(symbol));
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) break;
    if (reachable.has(node)) continue;
    reachable.add(node);
    for (const neighbor of graph.get(node) ?? []) pending.push(neighbor);
  }
  return reachable;
};

export const rankFan = (
  graph: DependencyGraph,
): {
  readonly in: { symbol: string; count: number }[];
  readonly out: { symbol: string; count: number }[];
} => {
  const fanIn = new Map([...graph.keys()].map((name) => [name, 0]));
  for (const references of graph.values()) {
    for (const target of references) fanIn.set(target, (fanIn.get(target) ?? 0) + 1);
  }
  const rank = (entries: Iterable<readonly [string, number]>) =>
    [...entries]
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((left, right) => right.count - left.count || compareBytes(left.symbol, right.symbol))
      .slice(0, 10);
  return {
    in: rank(fanIn),
    out: rank([...graph].map(([symbol, targets]) => [symbol, targets.size] as const)),
  };
};

export const maxCondensedDepth = (
  graph: DependencyGraph,
  components: readonly (readonly string[])[],
  reachable: ReadonlySet<string>,
): number => {
  const componentByNode = new Map<string, number>();
  components.forEach((component, index) => {
    component.forEach((node) => {
      componentByNode.set(node, index);
    });
  });
  const edges = new Map<number, Set<number>>();
  for (const [source, targets] of graph) {
    if (!reachable.has(source)) continue;
    const sourceComponent = required(componentByNode, source, "component");
    const outgoing = edges.get(sourceComponent) ?? new Set<number>();
    for (const target of targets) {
      if (!reachable.has(target)) continue;
      const targetComponent = required(componentByNode, target, "component");
      if (sourceComponent !== targetComponent) outgoing.add(targetComponent);
    }
    edges.set(sourceComponent, outgoing);
  }

  const memo = new Map<number, number>();
  const depth = (component: number): number => {
    const known = memo.get(component);
    if (known !== undefined) return known;
    const value = Math.max(0, ...[...(edges.get(component) ?? [])].map((next) => 1 + depth(next)));
    memo.set(component, value);
    return value;
  };
  const reachableComponents = new Set(
    [...reachable].map((node) => required(componentByNode, node, "reachable component")),
  );
  return Math.max(0, ...[...reachableComponents].map(depth));
};
