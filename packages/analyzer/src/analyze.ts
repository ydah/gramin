import {
  type Diagnostic,
  FEATURES_VERSION,
  type GrammarFeatures,
  type GrammarIR,
  validateFeatures,
} from "@gramin/core";
import { walkExpression } from "./expressions.js";
import {
  actionFeatures,
  lexiconFeatures,
  precedenceFeatures,
  sugarFeatures,
} from "./secondary-metrics.js";
import { sizeFeatures } from "./size.js";
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
  if (minor <= 2) return [];
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
  const used = usedTerminalKeys(ir);
  const unused = ir.terminals
    .filter((terminal) => !used.has(terminalKey(terminal)))
    .map((terminal) => terminal.name ?? terminal.literal ?? "")
    .filter(Boolean)
    .sort();
  if (unused.length > 0) {
    diagnostics.push({
      severity: "warning",
      code: "ANALYZER003_UNUSED_TERMINALS",
      message: `unused terminals: ${unused.join(", ")}`,
    });
  }
  return diagnostics;
};

export const analyzeGrammar = (ir: GrammarIR): GrammarFeatures => {
  const size = sizeFeatures(ir);
  const structure = structureFeatures(ir);
  const diagnostics = [
    ...ir.diagnostics,
    ...versionDiagnostics(ir.irVersion),
    ...analysisDiagnostics(ir, size, structure.features),
  ];
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
