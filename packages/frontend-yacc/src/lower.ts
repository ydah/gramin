import {
  type Alternative,
  type Diagnostic,
  type Expr,
  type GrammarIR,
  IR_VERSION,
  type TerminalDecl,
} from "@gramin/core";
import type { YaccAst, YaccItem } from "./ast.js";

interface LoweringContext {
  readonly aliases: ReadonlyMap<string, string>;
  readonly terminalLiterals: ReadonlyMap<string, string>;
  readonly terminalNames: ReadonlySet<string>;
  readonly ruleNames: ReadonlySet<string>;
  readonly diagnostics: Diagnostic[];
  readonly unresolved: Set<string>;
}

const terminalKey = (terminal: TerminalDecl): string =>
  terminal.name === undefined ? `literal:${terminal.literal}` : `name:${terminal.name}`;

const collectTerminals = (ast: YaccAst): TerminalDecl[] => {
  const terminals = new Map<string, TerminalDecl>();
  const add = (terminal: TerminalDecl): void => {
    const key = terminalKey(terminal);
    if (!terminals.has(key)) terminals.set(key, terminal);
  };

  for (const terminal of ast.terminals) {
    add({
      ...(terminal.name === undefined ? {} : { name: terminal.name }),
      ...(terminal.literal === undefined ? {} : { literal: terminal.literal }),
      ...(terminal.declaredType === undefined ? {} : { declaredType: terminal.declaredType }),
      loc: terminal.loc,
    } as TerminalDecl);
  }
  for (const level of ast.precedence) {
    for (const token of level.tokens) {
      add(
        token.literal
          ? { literal: token.value, loc: level.loc }
          : { name: token.value, loc: level.loc },
      );
    }
  }

  const declaredAliases = new Set(
    ast.terminals
      .filter((terminal) => terminal.literal !== undefined)
      .map((terminal) => terminal.literal),
  );
  const visit = (item: YaccItem): void => {
    if (item.kind === "literal" && !declaredAliases.has(item.value)) {
      add({ literal: item.value, loc: item.loc });
    }
    if (item.kind === "reference") item.args?.forEach(visit);
  };
  ast.rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach(visit);
    });
  });

  return [...terminals.values()];
};

const lowerItem = (item: YaccItem, context: LoweringContext): Expr => {
  if (item.kind === "action") {
    return { kind: "midRuleAction", codeLength: item.codeLength };
  }
  if (item.kind === "literal") {
    const alias = context.aliases.get(item.value);
    return alias
      ? { kind: "terminal", name: alias, literal: item.value }
      : { kind: "terminal", literal: item.value };
  }

  const args = item.args?.map((argument) => lowerItem(argument, context));
  const literal = context.terminalLiterals.get(item.name);
  if (context.terminalNames.has(item.name)) {
    return {
      kind: "terminal",
      name: item.name,
      ...(literal === undefined ? {} : { literal }),
    };
  }

  if (!context.ruleNames.has(item.name) && !context.unresolved.has(item.name)) {
    context.unresolved.add(item.name);
    context.diagnostics.push({
      severity: "warning",
      code: "YACC300_UNRESOLVED_SYMBOL",
      message: `unresolved symbol ${item.name}`,
      loc: item.loc,
    });
  }
  return {
    kind: "symbol",
    name: item.name,
    ...(args === undefined ? {} : { args }),
    ...(item.label === undefined ? {} : { label: item.label }),
  };
};

const lowerAlternative = (
  alternative: YaccAst["rules"][number]["alternatives"][number],
  context: LoweringContext,
): Alternative => {
  const items = [...alternative.items];
  const trailingAction = items.at(-1)?.kind === "action" ? items.pop() : undefined;
  return {
    items: items.map((item) => lowerItem(item, context)),
    ...(alternative.precedence === undefined ? {} : { precedence: alternative.precedence }),
    ...(trailingAction?.kind === "action"
      ? { action: { present: true, codeLength: trailingAction.codeLength } }
      : {}),
    loc: alternative.loc,
  };
};

export interface LowerOptions {
  readonly fileNames: readonly string[];
  readonly frontendId: string;
  readonly frontendVersion: string;
}

export const lowerYaccAst = (ast: YaccAst, options: LowerOptions): GrammarIR => {
  const terminals = collectTerminals(ast);
  const aliases = new Map<string, string>();
  const terminalLiterals = new Map<string, string>();
  const terminalNames = new Set<string>();
  for (const terminal of terminals) {
    if (terminal.name) terminalNames.add(terminal.name);
    if (terminal.name && terminal.literal !== undefined) {
      aliases.set(terminal.literal, terminal.name);
      terminalLiterals.set(terminal.name, terminal.literal);
    }
  }
  const ruleNames = new Set(ast.rules.map((rule) => rule.name));
  const diagnostics = [...ast.diagnostics];
  const context: LoweringContext = {
    aliases,
    terminalLiterals,
    terminalNames,
    ruleNames,
    diagnostics,
    unresolved: new Set(),
  };

  const rules = ast.rules.map((rule) => ({
    name: rule.name,
    ...(rule.params === undefined ? {} : { params: [...rule.params] }),
    ...(rule.isInline === undefined ? {} : { isInline: rule.isInline }),
    ...(rule.declaredType === undefined ? {} : { declaredType: rule.declaredType }),
    alternatives: rule.alternatives.map((alternative) => lowerAlternative(alternative, context)),
    loc: rule.loc,
  }));

  return {
    irVersion: IR_VERSION,
    source: {
      format: ast.dialect,
      dialect: ast.dialect,
      fileNames: [...options.fileNames],
      frontend: { id: options.frontendId, version: options.frontendVersion },
    },
    capabilities: {
      orderedChoice: false,
      ebnfSugar: false,
      predicates: false,
      scannerless: false,
      precedenceTable: true,
      parameterizedRules: ast.dialect === "lrama",
      lexerRules: false,
    },
    startSymbols:
      ast.startSymbols.length > 0 ? [...ast.startSymbols] : rules[0] ? [rules[0].name] : [],
    terminals,
    externalSymbols: [],
    precedence: ast.precedence.map((level) => ({
      assoc: level.assoc,
      tokens: level.tokens.map((token) => token.value),
      loc: level.loc,
    })),
    rules,
    diagnostics,
  };
};
