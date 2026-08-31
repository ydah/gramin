import {
  type Diagnostic,
  FEATURES_VERSION,
  type GrammarFeatures,
  type GrammarIR,
  compareBytes,
  mergeRulesByName,
  validateFeatures,
} from "@gramin/core";
import { alternativeRhsLength, maxExpressionNestingDepth, walkExpression } from "./expressions.js";
import { parseabilityAnalysis } from "./parseability.js";
import { redundancyFeatures } from "./redundancy.js";
import {
  actionFeatures,
  lexiconFeatures,
  precedenceFeatures,
  sugarFeatures,
} from "./secondary-metrics.js";
import { sizeFeatures } from "./size.js";
import { operationsFeatures, pegFeatures, styleFeatures } from "./specialized-metrics.js";
import { structureFeatures } from "./structure.js";

export class UnsupportedIRVersionError extends Error {
  constructor(version: string) {
    super(`Unsupported Grammar IR version ${version}`);
    this.name = "UnsupportedIRVersionError";
  }
}

const versionDiagnostics = (version: string): Diagnostic[] => {
  const [majorText, minorText] = version.split(".");
  const major = Number(majorText);
  const minor = Number(minorText);
  if (major === 0) {
    return [
      {
        severity: "warning",
        code: "ANALYZER005_LEGACY_IR_VERSION",
        message: `Grammar IR ${version} is supported for migration; emit version 1.0.0`,
      },
    ];
  }
  if (major !== 1) throw new UnsupportedIRVersionError(version);
  if (minor <= 3) return [];
  return [
    {
      severity: "warning",
      code: "ANALYZER004_FUTURE_IR_MINOR",
      message: `analyzing future compatible Grammar IR minor version ${version}`,
    },
  ];
};

const terminalKey = (terminal: GrammarIR["terminals"][number]): string =>
  terminal.name === undefined ? `literal:${terminal.literal}` : `name:${terminal.name}`;

const usedTerminalKeys = (ir: GrammarIR): Set<string> => {
  const used = new Set<string>();
  ir.rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      if (alternative.precedence !== undefined) used.add(`name:${alternative.precedence}`);
      alternative.items.forEach((item) => {
        walkExpression(item, (expression) => {
          if (expression.kind !== "terminal") return;
          if (expression.name !== undefined) used.add(`name:${expression.name}`);
          else used.add(`literal:${expression.literal}`);
        });
      });
    });
  });
  return used;
};

const analysisDiagnostics = (
  ir: GrammarIR,
  size: GrammarFeatures["size"],
  structure: GrammarFeatures["structure"],
  parseability: GrammarFeatures["parseability"],
  peg: GrammarFeatures["peg"],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  if (size.unresolvedSymbols.count > 0) {
    diagnostics.push({
      severity: "warning",
      code: "ANALYZER001_UNRESOLVED_SYMBOLS",
      message: `unresolved symbols: ${size.unresolvedSymbols.names.join(", ")}`,
    });
  }
  if (structure.unreachableSymbols.length > 0) {
    diagnostics.push({
      severity: "warning",
      code: "ANALYZER002_UNREACHABLE_RULES",
      message: `unreachable rules: ${structure.unreachableSymbols.join(", ")}`,
    });
  }
  if (structure.unproductiveSymbols.length > 0) {
    diagnostics.push({
      severity: "warning",
      code: "ANALYZER006_UNPRODUCTIVE_RULES",
      message: `unproductive rules: ${structure.unproductiveSymbols.join(", ")}`,
    });
  }
  if (parseability.cyclicUnitRules.length > 0) {
    diagnostics.push({
      severity: "error",
      code: "ANALYZER007_CYCLIC_UNIT_RULES",
      message: `cyclic unit rules: ${parseability.cyclicUnitRules.map((members) => members.join(" -> ")).join("; ")}`,
    });
  }
  if ((peg.shadowedAlternativePairs ?? 0) > 0) {
    diagnostics.push({
      severity: "warning",
      code: "ANALYZER008_SHADOWED_ALTERNATIVES",
      message: `ordered alternatives shadow ${peg.shadowedAlternativePairs} later alternative pair(s)`,
    });
  }
  const used = usedTerminalKeys(ir);
  const unused = ir.terminals
    .filter((terminal) => !used.has(terminalKey(terminal)))
    .map((terminal) => terminal.name ?? terminal.literal ?? "")
    .filter(Boolean)
    .sort(compareBytes);
  if (unused.length > 0) {
    diagnostics.push({
      severity: "warning",
      code: "ANALYZER003_UNUSED_TERMINALS",
      message: `unused terminals: ${unused.join(", ")}`,
    });
  }
  return diagnostics;
};

export interface AnalyzeOptions {
  readonly lr?: boolean;
}

export const analyzeGrammar = (ir: GrammarIR, options: AnalyzeOptions = {}): GrammarFeatures => {
  const size = sizeFeatures(ir);
  const structure = structureFeatures(ir);
  const parseabilityResult = parseabilityAnalysis(ir, options);
  const parseability = parseabilityResult.features;
  const peg = pegFeatures(ir);
  const diagnostics = [
    ...ir.diagnostics,
    ...versionDiagnostics(ir.irVersion),
    ...analysisDiagnostics(ir, size, structure.features, parseability, peg),
  ];
  const incoming = new Map([...structure.graph.keys()].map((name) => [name, new Set<string>()]));
  structure.graph.forEach((targets, source) => {
    targets.forEach((target) => {
      incoming.get(target)?.add(source);
    });
  });
  const perRule = mergeRulesByName(ir.rules)
    .map((rule) => {
      const shortestDerivation = structure.shortestDerivations.get(rule.name);
      const rhsLengths = rule.alternatives.map(alternativeRhsLength);
      const ruleParseability = parseabilityResult.perRule.get(rule.name);
      return {
        rule: rule.name,
        alternatives: rule.alternatives.length,
        rhsItems: rhsLengths.reduce((total, length) => total + length, 0),
        maxRhsItems: rhsLengths.reduce((maximum, length) => Math.max(maximum, length), 0),
        maxExpressionNestingDepth: maxExpressionNestingDepth(
          rule.alternatives.flatMap((alternative) => alternative.items),
        ),
        fanIn: incoming.get(rule.name)?.size ?? 0,
        fanOut: structure.graph.get(rule.name)?.size ?? 0,
        references: [...(structure.graph.get(rule.name) ?? [])].sort(compareBytes),
        referencedBy: [...(incoming.get(rule.name) ?? [])].sort(compareBytes),
        reachableFromStarts: structure.features.startSymbolReachability.entries
          .filter((entry) => entry.rules.includes(rule.name))
          .map((entry) => entry.symbol),
        unitRules: ruleParseability?.unitRules ?? 0,
        ...(ruleParseability?.firstSetSize === undefined
          ? {}
          : { firstSetSize: ruleParseability.firstSetSize }),
        ...(ruleParseability?.followSetSize === undefined
          ? {}
          : { followSetSize: ruleParseability.followSetSize }),
        ...(ruleParseability?.ll1Conflicts === undefined
          ? {}
          : { ll1Conflicts: ruleParseability.ll1Conflicts }),
        ...(shortestDerivation === undefined || !Number.isFinite(shortestDerivation)
          ? {}
          : { shortestDerivation }),
      };
    })
    .sort((left, right) => compareBytes(left.rule, right.rule));
  const features: GrammarFeatures = {
    featuresVersion: FEATURES_VERSION,
    source: { ...ir.source },
    capabilities: { ...ir.capabilities },
    size,
    structure: structure.features,
    precedence: precedenceFeatures(ir),
    lexicon: lexiconFeatures(ir),
    sugar: sugarFeatures(ir),
    actions: actionFeatures(ir),
    parseability,
    redundancy: redundancyFeatures(ir),
    peg,
    operations: operationsFeatures(ir),
    style: styleFeatures(ir),
    perRule,
    notable: {
      ...(size.maxAltPerRule.rule
        ? {
            largestRule: {
              name: size.maxAltPerRule.rule,
              ...(size.maxAltPerRule.line === undefined ? {} : { line: size.maxAltPerRule.line }),
            },
          }
        : {}),
      deepestRecursionMembers: [...structure.largestRecursiveMembers],
      coreSymbols: [...structure.coreSymbols],
    },
    diagnostics,
  };
  const validation = validateFeatures(features);
  if (!validation.ok) {
    throw new Error(
      `Analyzer produced invalid features: ${validation.issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`,
    );
  }
  return features;
};
