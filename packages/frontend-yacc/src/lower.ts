import {
  type Alternative,
  compareBytes,
  type Diagnostic,
  type Expr,
  type GrammarIR,
  IR_VERSION,
  mergeRulesByName,
  type TerminalDecl,
} from "@gramin/core";
import type { YaccAst, YaccItem, YaccRule } from "./ast.js";
import { LRAMA_STDLIB_RULES } from "./lrama-stdlib.js";

interface LoweringContext {
  readonly aliases: ReadonlyMap<string, string>;
  readonly terminalLiterals: ReadonlyMap<string, string>;
  readonly terminalNames: ReadonlySet<string>;
  readonly ruleNames: ReadonlySet<string>;
  readonly externalNames: ReadonlySet<string>;
  readonly parameterNames: ReadonlyMap<string, string>;
  readonly parameterizedRuleNames: ReadonlyMap<string, ReadonlyMap<number, string>>;
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
    if (item.kind === "repeat") {
      visit(item.item);
      return;
    }
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
  if (item.kind === "repeat") {
    return { kind: item.operator, expr: lowerItem(item.item, context) };
  }
  if (item.kind === "literal") {
    const alias = context.aliases.get(item.value);
    return alias
      ? { kind: "terminal", name: alias, literal: item.value }
      : { kind: "terminal", literal: item.value };
  }

  const args = item.args?.map((argument) => lowerItem(argument, context));
  const name =
    context.parameterNames.get(item.name) ??
    (args === undefined
      ? item.name
      : (context.parameterizedRuleNames.get(item.name)?.get(args.length) ?? item.name));
  const literal = context.terminalLiterals.get(name);
  if (context.terminalNames.has(name) && !context.parameterNames.has(item.name)) {
    if (item.label !== undefined) {
      context.diagnostics.push({
        severity: "info",
        code: "IR012_LOSSY_TERMINAL_LABEL",
        message: `terminal label ${item.label} is not represented in Grammar IR v0.2`,
        loc: item.loc,
      });
    }
    return {
      kind: "terminal",
      name,
      ...(literal === undefined ? {} : { literal }),
    };
  }

  if (
    !context.ruleNames.has(name) &&
    !context.externalNames.has(name) &&
    !context.parameterNames.has(item.name) &&
    !context.unresolved.has(name)
  ) {
    context.unresolved.add(name);
    context.diagnostics.push({
      severity: "warning",
      code: "YACC300_UNRESOLVED_SYMBOL",
      message: `unresolved symbol ${name}`,
      loc: item.loc,
    });
  }
  return {
    kind: "symbol",
    name,
    ...(args === undefined ? {} : { args }),
    ...(item.label === undefined ? {} : { label: item.label }),
  };
};

const createParameterizedRuleNames = (
  rules: readonly YaccRule[],
  occupiedNames: Set<string>,
): ReadonlyMap<string, ReadonlyMap<number, string>> => {
  const aritiesByName = new Map<string, Set<number | undefined>>();
  for (const rule of rules) {
    const arities = aritiesByName.get(rule.name) ?? new Set<number | undefined>();
    arities.add(rule.params?.length);
    aritiesByName.set(rule.name, arities);
  }
  const names = new Map<string, Map<number, string>>();
  for (const [name, arities] of aritiesByName) {
    if (arities.size < 2) continue;
    const namesByArity = new Map<number, string>();
    for (const arity of arities) {
      if (arity === undefined) continue;
      const base = `@yacc/parameterized/${encodeURIComponent(name)}/${arity}`;
      let identity = base;
      let suffix = 1;
      while (occupiedNames.has(identity)) identity = `${base}~${suffix++}`;
      occupiedNames.add(identity);
      namesByArity.set(arity, identity);
    }
    names.set(name, namesByArity);
  }
  return names;
};

const normalizeRuleParameters = (
  rules: readonly YaccRule[],
): ReadonlyMap<YaccRule, readonly string[]> => {
  const declarations = new Map<string, Map<number, YaccRule[]>>();
  for (const rule of rules) {
    if (rule.params === undefined) continue;
    const arities = declarations.get(rule.name) ?? new Map<number, YaccRule[]>();
    const matching = arities.get(rule.params.length) ?? [];
    matching.push(rule);
    arities.set(rule.params.length, matching);
    declarations.set(rule.name, arities);
  }
  const normalized = new Map<YaccRule, readonly string[]>();
  for (const arities of declarations.values()) {
    for (const matching of arities.values()) {
      const first = matching[0]?.params;
      if (
        !first ||
        !matching.some((rule) => rule.params?.some((name, index) => name !== first[index]))
      ) {
        continue;
      }
      const freeNames = new Set<string>();
      const occupiedNames = new Set(matching.flatMap((rule) => rule.params ?? []));
      for (const rule of matching) {
        const parameters = new Set(rule.params);
        const visit = (item: YaccItem): void => {
          if (item.kind === "repeat") visit(item.item);
          if (item.kind !== "reference") return;
          occupiedNames.add(item.name);
          if (!parameters.has(item.name)) freeNames.add(item.name);
          item.args?.forEach(visit);
        };
        rule.alternatives.forEach((alternative) => {
          alternative.items.forEach(visit);
        });
      }
      const params = first.map((name) => {
        if (!freeNames.has(name)) return name;
        let suffix = 1;
        let fresh = `${name}_${suffix++}`;
        while (occupiedNames.has(fresh)) fresh = `${name}_${suffix++}`;
        occupiedNames.add(fresh);
        return fresh;
      });
      matching.forEach((rule) => {
        normalized.set(rule, params);
      });
    }
  }
  return normalized;
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
  const usedParameterizedNames = new Set<string>();
  const usedReferenceNames = new Set<string>();
  const collectParameterizedNames = (item: YaccItem): void => {
    if (item.kind === "repeat") {
      collectParameterizedNames(item.item);
      return;
    }
    if (item.kind !== "reference") return;
    usedReferenceNames.add(item.name);
    if (item.args !== undefined) usedParameterizedNames.add(item.name);
    item.args?.forEach(collectParameterizedNames);
  };
  ast.rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach(collectParameterizedNames);
    });
  });
  const parameterizedRuleNames = createParameterizedRuleNames(
    ast.rules,
    new Set([
      ...ruleNames,
      ...terminalNames,
      ...usedReferenceNames,
      ...ast.rules.flatMap((rule) => rule.params ?? []),
    ]),
  );
  const loweredRuleName = (rule: YaccRule): string =>
    rule.params === undefined
      ? rule.name
      : (parameterizedRuleNames.get(rule.name)?.get(rule.params.length) ?? rule.name);
  const stdlibNames = new Set(
    [...usedParameterizedNames].filter(
      (name) => LRAMA_STDLIB_RULES.has(name) && !ruleNames.has(name),
    ),
  );
  const builtinNames = new Set(
    usedReferenceNames.has("error") && !ruleNames.has("error") ? ["error"] : [],
  );
  const externalNames = new Set([...stdlibNames, ...builtinNames]);
  const hasEbnfSugar = ast.rules.some((rule) =>
    rule.alternatives.some((alternative) => {
      const containsRepeat = (item: YaccItem): boolean =>
        item.kind === "repeat" ||
        (item.kind === "reference" && (item.args?.some(containsRepeat) ?? false));
      return alternative.items.some(containsRepeat);
    }),
  );
  const diagnostics = [...ast.diagnostics];
  const normalizedParameters = normalizeRuleParameters(ast.rules);
  const context: LoweringContext = {
    aliases,
    terminalLiterals,
    terminalNames,
    ruleNames: new Set(ast.rules.map(loweredRuleName)),
    externalNames,
    parameterNames: new Map(),
    parameterizedRuleNames,
    diagnostics,
    unresolved: new Set(),
  };

  const rules = mergeRulesByName(
    ast.rules.map((rule) => {
      const params = normalizedParameters.get(rule) ?? rule.params;
      const ruleContext: LoweringContext = {
        ...context,
        parameterNames: new Map(
          (rule.params ?? []).map((name, index) => [name, params?.[index] ?? name]),
        ),
      };
      return {
        name: loweredRuleName(rule),
        ...(params === undefined ? {} : { params: [...params] }),
        ...(rule.isInline === undefined ? {} : { isInline: rule.isInline }),
        ...(rule.declaredType === undefined ? {} : { declaredType: rule.declaredType }),
        alternatives: rule.alternatives.map((alternative) =>
          lowerAlternative(alternative, ruleContext),
        ),
        loc: rule.loc,
      };
    }),
  );
  const startSymbols =
    ast.startSymbols.length > 0
      ? ast.startSymbols.flatMap((name) => {
          if (context.ruleNames.has(name)) return [name];
          const templates = parameterizedRuleNames.get(name);
          if (!templates) return [name];
          const zeroArgument = templates.get(0);
          if (zeroArgument !== undefined) return [zeroArgument];
          const loc = ast.rules.find((rule) => rule.name === name)?.loc;
          diagnostics.push({
            severity: "error",
            code: "YACC301_AMBIGUOUS_START_SYMBOL",
            message: `start symbol ${name} names multiple parameterized rule arities; choose an ordinary entry rule`,
            ...(loc === undefined ? {} : { loc }),
          });
          return [];
        })
      : rules[0]
        ? [rules[0].name]
        : [];
  const documentedRules = new Set(ast.rules.filter((rule) => rule.documented).map(loweredRuleName));
  let hasAmbiguousDocumentation = false;
  for (const name of new Set(ast.sourceMetrics?.comments.documentedRules ?? [])) {
    const declarations = ast.rules.filter((rule) => rule.name === name);
    if (declarations.every((rule) => rule.documented !== undefined)) continue;
    const candidates = new Set(
      declarations.filter((rule) => rule.documented !== false).map(loweredRuleName),
    );
    if (candidates.size === 1) {
      candidates.forEach((identity) => {
        documentedRules.add(identity);
      });
      continue;
    }
    hasAmbiguousDocumentation = true;
    diagnostics.push({
      severity: "warning",
      code: "YACC302_AMBIGUOUS_RULE_DOCUMENTATION",
      message: `name-only documentation for ${name} cannot identify its documented declaration`,
    });
  }

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
      ebnfSugar: hasEbnfSugar,
      predicates: false,
      scannerless: false,
      precedenceTable: true,
      parameterizedRules:
        ast.rules.some((rule) => rule.params !== undefined) || usedParameterizedNames.size > 0,
      lexerRules: false,
    },
    startSymbols,
    terminals,
    externalSymbols: [
      ...[...stdlibNames]
        .sort(compareBytes)
        .map((name) => ({ name, origin: "stdlib", kind: "rule" as const })),
      ...[...builtinNames]
        .sort(compareBytes)
        .map((name) => ({ name, origin: "builtin", kind: "terminal" as const })),
    ],
    precedence: ast.precedence.map((level) => ({
      assoc: level.assoc,
      tokens: level.tokens.map((token) => token.value),
      loc: level.loc,
    })),
    ...(ast.sourceMetrics === undefined
      ? {}
      : {
          sourceMetrics: {
            sourceCharacters: ast.sourceMetrics.sourceCharacters,
            ...(hasAmbiguousDocumentation
              ? {}
              : {
                  comments: {
                    ...ast.sourceMetrics.comments,
                    documentedRules: [...documentedRules],
                  },
                }),
            declarationDirectives: { ...ast.sourceMetrics.declarationDirectives },
            explicitEmptyAlternatives: ast.sourceMetrics.explicitEmptyAlternatives,
            actionReferences: { ...ast.sourceMetrics.actionReferences },
          },
        }),
    rules,
    diagnostics,
  };
};
