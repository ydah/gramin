import type { GrammarIR } from "@gramin/core";
import { compareBytes } from "@gramin/core";
import { collectReferences } from "./expressions.js";

export type DependencyGraph = ReadonlyMap<string, ReadonlySet<string>>;

const required = <K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V => {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing ${label} for graph node`);
  return value;
};

export const buildDependencyGraph = (ir: GrammarIR): DependencyGraph => {
  const ruleNames = new Set(ir.rules.map((rule) => rule.name));
  const graph = new Map<string, Set<string>>();
  for (const rule of ir.rules) {
    const references = graph.get(rule.name) ?? new Set<string>();
    for (const alternative of rule.alternatives) {
      for (const reference of collectReferences(alternative)) {
        if (ruleNames.has(reference)) references.add(reference);
      }
    }
    graph.set(rule.name, references);
  }
  return graph;
};

export const stronglyConnectedComponents = (graph: DependencyGraph): string[][] => {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  type Frame = { readonly node: string; readonly neighbors: readonly string[]; next: number };
  const connect = (root: string): void => {
    const enter = (node: string): Frame => {
      const index = nextIndex;
      nextIndex += 1;
      indices.set(node, index);
      lowLinks.set(node, index);
      stack.push(node);
      onStack.add(node);
      return { node, neighbors: [...(graph.get(node) ?? [])], next: 0 };
    };
    const frames: Frame[] = [enter(root)];
    while (frames.length > 0) {
      const frame = frames.at(-1);
      if (!frame) break;
      const neighbor = frame.neighbors[frame.next];
      if (neighbor !== undefined) {
        frame.next += 1;
        if (!indices.has(neighbor)) {
          frames.push(enter(neighbor));
          continue;
        }
        if (onStack.has(neighbor)) {
          lowLinks.set(
            frame.node,
            Math.min(
              required(lowLinks, frame.node, "low link"),
              required(indices, neighbor, "neighbor index"),
            ),
          );
        }
        continue;
      }

      frames.pop();
      const parent = frames.at(-1);
      if (parent) {
        lowLinks.set(
          parent.node,
          Math.min(
            required(lowLinks, parent.node, "low link"),
            required(lowLinks, frame.node, "child low link"),
          ),
        );
      }
      if (lowLinks.get(frame.node) !== indices.get(frame.node)) continue;
      const component: string[] = [];
      while (stack.length > 0) {
        const member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
        if (member === frame.node) break;
      }
      components.push(component.sort(compareBytes));
    }
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
    const pending = [component];
    const visiting = new Set<number>();
    while (pending.length > 0) {
      const current = pending.at(-1);
      if (current === undefined) break;
      const currentKnown = memo.get(current);
      if (currentKnown !== undefined) {
        pending.pop();
        continue;
      }
      if (!visiting.has(current)) {
        visiting.add(current);
        for (const next of edges.get(current) ?? []) {
          if (!memo.has(next)) pending.push(next);
        }
        continue;
      }
      let value = 0;
      for (const next of edges.get(current) ?? []) {
        value = Math.max(value, 1 + (memo.get(next) ?? 0));
      }
      memo.set(current, value);
      visiting.delete(current);
      pending.pop();
    }
    return memo.get(component) ?? 0;
  };
  const reachableComponents = new Set(
    [...reachable].map((node) => required(componentByNode, node, "reachable component")),
  );
  return [...reachableComponents].reduce(
    (maximum, component) => Math.max(maximum, depth(component)),
    0,
  );
};
