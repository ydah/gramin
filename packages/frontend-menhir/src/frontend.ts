import {
  type Alternative,
  type Diagnostic,
  type Expr,
  type Frontend,
  type FrontendResult,
  type GrammarIR,
  IR_VERSION,
  mergeRulesByName,
  type SourceFile,
  type SourceSpan,
  type TerminalDecl,
} from "@gramin/core";
import { MENHIR_STDLIB_RULES } from "./stdlib.js";

export const FRONTEND_MENHIR_ID = "menhir";
export const FRONTEND_MENHIR_VERSION = "0.1.0";

type TokenKind =
  | "identifier"
  | "literal"
  | "directive"
  | "colon"
  | "semi"
  | "pipe"
  | "lparen"
  | "rparen"
  | "comma"
  | "assign"
  | "question"
  | "star"
  | "plus"
  | "action"
  | "other"
  | "eof";

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly loc: SourceSpan;
}

interface ParsedRule {
  readonly name: string;
  readonly params?: readonly string[];
  readonly isInline?: boolean;
  readonly declaredType?: string;
  readonly alternatives: readonly Alternative[];
  readonly loc: SourceSpan;
}

const span = (
  startLine: number,
  startCol: number,
  endLine = startLine,
  endCol = startCol + 1,
): SourceSpan => ({ startLine, startCol, endLine, endCol });

const maskPreambleAndComments = (
  source: string,
): { readonly text: string; readonly diagnostics: Diagnostic[] } => {
  const characters = [...source];
  const diagnostics: Diagnostic[] = [];
  let index = 0;
  let commentDepth = 0;
  let preamble = false;
  const mask = (position: number): void => {
    if (characters[position] !== "\n") characters[position] = " ";
  };
  while (index < characters.length) {
    if (!preamble && source.startsWith("%{", index)) {
      preamble = true;
      mask(index);
      mask(index + 1);
      index += 2;
      continue;
    }
    if (preamble) {
      if (source.startsWith("%}", index)) {
        mask(index);
        mask(index + 1);
        index += 2;
        preamble = false;
      } else {
        mask(index);
        index += 1;
      }
      continue;
    }
    if (source.startsWith("(*", index)) {
      commentDepth += 1;
      mask(index);
      mask(index + 1);
      index += 2;
      continue;
    }
    if (commentDepth > 0) {
      if (source.startsWith("*)", index)) {
        commentDepth -= 1;
        mask(index);
        mask(index + 1);
        index += 2;
      } else {
        mask(index);
        index += 1;
      }
      continue;
    }
    index += 1;
  }
  if (preamble) {
    diagnostics.push({
      severity: "error",
      code: "MENHIR001_UNCLOSED_PREAMBLE",
      message: "unclosed Menhir %{ ... %} preamble",
    });
  }
  if (commentDepth > 0) {
    diagnostics.push({
      severity: "error",
      code: "MENHIR002_UNCLOSED_COMMENT",
      message: "unclosed OCaml comment",
    });
  }
  return { text: characters.join(""), diagnostics };
};

const lexRules = (
  source: string,
): { readonly tokens: Token[]; readonly diagnostics: Diagnostic[] } => {
  const masked = maskPreambleAndComments(source);
  const section = masked.text.includes("%%") ? (masked.text.split("%%", 2)[1] ?? "") : masked.text;
  const lineOffset = masked.text.includes("%%")
    ? (masked.text.split("%%", 1)[0]?.match(/\n/gu)?.length ?? 0)
    : 0;
  const tokens: Token[] = [];
  const diagnostics = [...masked.diagnostics];
  let offset = 0;
  let line = lineOffset + 1;
  let col = 1;
  const advance = (): string => {
    const character = section[offset] ?? "";
    offset += 1;
    if (character === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
    return character;
  };
  const push = (kind: TokenKind, value: string, startLine: number, startCol: number): void => {
    tokens.push({ kind, value, loc: span(startLine, startCol, line, col) });
  };
  while (offset < section.length) {
    const character = section[offset];
    if (character && /\s/u.test(character)) {
      advance();
      continue;
    }
    const startLine = line;
    const startCol = col;
    if (character === "{") {
      let depth = 0;
      let quote = "";
      let escaped = false;
      let length = 0;
      while (offset < section.length) {
        const current = advance();
        length += 1;
        if (quote) {
          if (escaped) escaped = false;
          else if (current === "\\") escaped = true;
          else if (current === quote) quote = "";
        } else if (current === "'" || current === '"') {
          quote = current;
        } else if (current === "{") {
          depth += 1;
        } else if (current === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (depth !== 0) {
        diagnostics.push({
          severity: "error",
          code: "MENHIR003_UNCLOSED_ACTION",
          message: "unclosed Menhir semantic action",
          loc: span(startLine, startCol),
        });
      }
      push("action", String(length), startLine, startCol);
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = advance();
      let value = "";
      let escaped = false;
      while (offset < section.length) {
        const current = advance();
        if (escaped) {
          value += current === "n" ? "\n" : current === "t" ? "\t" : current;
          escaped = false;
        } else if (current === "\\") {
          escaped = true;
        } else if (current === quote) {
          break;
        } else {
          value += current;
        }
      }
      push("literal", value, startLine, startCol);
      continue;
    }
    if (character === "%") {
      advance();
      let value = "";
      while (offset < section.length && /[\p{L}\p{N}_]/u.test(section[offset] ?? "")) {
        value += advance();
      }
      push("directive", value, startLine, startCol);
      continue;
    }
    if (character && /[\p{L}_]/u.test(character)) {
      let value = "";
      while (offset < section.length && /[\p{L}\p{N}_']/u.test(section[offset] ?? "")) {
        value += advance();
      }
      push("identifier", value, startLine, startCol);
      continue;
    }
    const punctuation: Readonly<Record<string, TokenKind>> = {
      ":": "colon",
      ";": "semi",
      "|": "pipe",
      "(": "lparen",
      ")": "rparen",
      ",": "comma",
      "=": "assign",
      "?": "question",
      "*": "star",
      "+": "plus",
    };
    const kind = punctuation[character ?? ""] ?? "other";
    advance();
    push(kind, character ?? "", startLine, startCol);
  }
  tokens.push({ kind: "eof", value: "", loc: span(line, col) });
  return { tokens, diagnostics };
};

const declarations = (
  source: string,
): {
  readonly terminals: TerminalDecl[];
  readonly startSymbols: string[];
  readonly types: ReadonlyMap<string, string>;
  readonly precedence: GrammarIR["precedence"];
} => {
  const header = source.includes("%%") ? (source.split("%%", 1)[0] ?? "") : "";
  const terminals = new Map<string, TerminalDecl>();
  const startSymbols: string[] = [];
  const types = new Map<string, string>();
  const precedence: GrammarIR["precedence"] = [];
  const lines = header.split(/\r?\n/u);
  lines.forEach((line, index) => {
    const tokenMatch = /^\s*%token(?:\s+<([^>]+)>)?\s+(.+)$/u.exec(line);
    if (tokenMatch) {
      const declaredType = tokenMatch[1]?.trim();
      const parts =
        tokenMatch[2]?.match(/[\p{L}_][\p{L}\p{N}_']*|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'/gu) ?? [];
      let lastName: string | undefined;
      parts.forEach((part) => {
        const quoted = part.startsWith('"') || part.startsWith("'");
        if (quoted && lastName) {
          const previous = terminals.get(lastName);
          if (previous) terminals.set(lastName, { ...previous, literal: part.slice(1, -1) });
        } else if (!quoted) {
          lastName = part;
          terminals.set(part, {
            name: part,
            ...(declaredType ? { declaredType } : {}),
            loc: span(index + 1, 1, index + 1, line.length + 1),
          });
        }
      });
      return;
    }
    const startMatch = /^\s*%start(?:\s+<[^>]+>)?\s+(.+)$/u.exec(line);
    if (startMatch) {
      startSymbols.push(
        ...(startMatch[1]?.match(/[\p{L}_][\p{L}\p{N}_']*/gu) ?? []).filter(
          (name) => name !== "type",
        ),
      );
      return;
    }
    const typeMatch = /^\s*%type\s+<([^>]+)>\s+(.+)$/u.exec(line);
    if (typeMatch) {
      (typeMatch[2]?.match(/[\p{L}_][\p{L}\p{N}_']*/gu) ?? []).forEach((name) => {
        types.set(name, typeMatch[1]?.trim() ?? "");
      });
      return;
    }
    const precedenceMatch = /^\s*%(left|right|nonassoc)\s+(.+)$/u.exec(line);
    if (precedenceMatch) {
      const assoc = precedenceMatch[1];
      if (assoc === "left" || assoc === "right" || assoc === "nonassoc") {
        precedence.push({
          assoc,
          tokens: precedenceMatch[2]?.match(/[\p{L}_][\p{L}\p{N}_']*/gu) ?? [],
          loc: span(index + 1, 1, index + 1, line.length + 1),
        });
      }
    }
  });
  return { terminals: [...terminals.values()], startSymbols, types, precedence };
};

class RuleParser {
  readonly diagnostics: Diagnostic[];
  readonly rules: ParsedRule[] = [];
  #index = 0;

  constructor(
    private readonly tokens: readonly Token[],
    diagnostics: readonly Diagnostic[],
    private readonly terminalNames: ReadonlySet<string>,
    private readonly aliases: ReadonlyMap<string, string>,
  ) {
    this.diagnostics = [...diagnostics];
  }

  parse(types: ReadonlyMap<string, string>): readonly ParsedRule[] {
    while (this.current().kind !== "eof") {
      let inline = false;
      if (this.current().kind === "directive" && this.current().value === "inline") {
        inline = true;
        this.#index += 1;
      }
      if (this.current().kind === "directive" && this.current().value === "public") {
        this.#index += 1;
      }
      if (this.current().kind !== "identifier") {
        this.#index += 1;
        continue;
      }
      const name = this.current();
      const params: string[] = [];
      this.#index += 1;
      if (this.current().kind === "lparen") {
        this.#index += 1;
        while (this.current().kind !== "rparen" && this.current().kind !== "eof") {
          if (this.current().kind === "identifier") params.push(this.current().value);
          this.#index += 1;
        }
        if (this.current().kind === "rparen") this.#index += 1;
      }
      if (this.current().kind !== "colon") {
        this.recover();
        continue;
      }
      this.#index += 1;
      const alternatives: Alternative[] = [];
      let tokens: Token[] = [];
      const bodyStart = this.#index;
      while (
        this.current().kind !== "semi" &&
        this.current().kind !== "eof" &&
        (this.#index === bodyStart || !this.isRuleStart(this.#index))
      ) {
        if (this.current().kind === "pipe") {
          if (tokens.length > 0 || alternatives.length > 0) {
            alternatives.push(this.lowerAlternative(tokens, new Set(params)));
          }
          tokens = [];
          this.#index += 1;
        } else {
          tokens.push(this.current());
          this.#index += 1;
        }
      }
      alternatives.push(this.lowerAlternative(tokens, new Set(params)));
      if (this.current().kind === "semi") this.#index += 1;
      const declaredType = types.get(name.value);
      this.rules.push({
        name: name.value,
        ...(params.length > 0 ? { params } : {}),
        ...(inline ? { isInline: true } : {}),
        ...(declaredType ? { declaredType } : {}),
        alternatives,
        loc: name.loc,
      });
    }
    return this.rules;
  }

  private isRuleStart(index: number): boolean {
    let cursor = index;
    while (
      this.tokens[cursor]?.kind === "directive" &&
      (this.tokens[cursor]?.value === "inline" || this.tokens[cursor]?.value === "public")
    ) {
      cursor += 1;
    }
    return this.tokens[cursor]?.kind === "identifier" && this.tokens[cursor + 1]?.kind === "colon";
  }

  private current(): Token {
    return (
      this.tokens[this.#index] ??
      this.tokens.at(-1) ?? {
        kind: "eof",
        value: "",
        loc: span(1, 1),
      }
    );
  }

  private recover(): void {
    while (this.current().kind !== "semi" && this.current().kind !== "eof") this.#index += 1;
    if (this.current().kind === "semi") this.#index += 1;
  }

  private lowerPrimary(
    tokens: readonly Token[],
    start: number,
    parameterNames: ReadonlySet<string>,
    label?: string,
  ): { readonly expression?: Expr; readonly next: number } {
    const primary = tokens[start];
    if (!primary) return { next: start };
    let expression: Expr | undefined;
    let next = start + 1;
    if (primary.kind === "identifier") {
      const args: Expr[] = [];
      if (tokens[next]?.kind === "lparen") {
        next += 1;
        while (
          next < tokens.length &&
          tokens[next]?.kind !== "rparen" &&
          tokens[next]?.kind !== "eof"
        ) {
          if (tokens[next]?.kind === "comma") {
            next += 1;
            continue;
          }
          const argument = this.lowerPrimary(tokens, next, parameterNames);
          if (argument.expression) args.push(argument.expression);
          next = argument.next > next ? argument.next : next + 1;
        }
        if (tokens[next]?.kind === "rparen") next += 1;
      }
      if (this.terminalNames.has(primary.value) && !parameterNames.has(primary.value)) {
        expression = { kind: "terminal", name: primary.value };
      } else {
        expression = {
          kind: "symbol",
          name: primary.value,
          ...(args.length > 0 ? { args } : {}),
          ...(label ? { label } : {}),
        };
      }
    } else if (primary.kind === "literal") {
      const alias = this.aliases.get(primary.value);
      expression = alias
        ? { kind: "terminal", name: alias, literal: primary.value }
        : { kind: "terminal", literal: primary.value };
    }
    if (expression === undefined) return { next };
    const postfix = tokens[next]?.kind;
    if (postfix === "question" || postfix === "star" || postfix === "plus") {
      return {
        expression: {
          kind: postfix === "question" ? "opt" : postfix,
          expr: expression,
        },
        next: next + 1,
      };
    }
    return { expression, next };
  }

  private lowerAlternative(
    tokens: readonly Token[],
    parameterNames: ReadonlySet<string>,
  ): Alternative {
    const items: Expr[] = [];
    let precedence: string | undefined;
    let trailingAction: Token | undefined;
    let index = 0;
    while (index < tokens.length) {
      const token = tokens[index];
      if (!token) break;
      if (token.kind === "directive" && token.value === "prec") {
        const target = tokens[index + 1];
        if (target?.kind === "identifier") precedence = target.value;
        index += target ? 2 : 1;
        continue;
      }
      if (token.kind === "action") {
        if (tokens.slice(index + 1).every((candidate) => candidate.kind === "other")) {
          trailingAction = token;
        } else {
          items.push({ kind: "midRuleAction", codeLength: Number(token.value) });
        }
        index += 1;
        continue;
      }
      let label: string | undefined;
      if (token.kind === "identifier" && tokens[index + 1]?.kind === "assign") {
        label = token.value;
        index += 2;
      }
      const lowered = this.lowerPrimary(tokens, index, parameterNames, label);
      const expression = lowered.expression;
      index = lowered.next > index ? lowered.next : index + 1;
      if (!expression) continue;
      items.push(expression);
    }
    return {
      items,
      ...(precedence ? { precedence } : {}),
      ...(trailingAction
        ? { action: { present: true, codeLength: Number(trailingAction.value) } }
        : {}),
      ...(tokens[0] ? { loc: tokens[0].loc } : {}),
    };
  }
}

const visit = (
  expression: Expr,
  names: Set<string>,
  calls: Set<string>,
  literals: Set<string>,
  flags: { sugar: boolean },
): void => {
  if (expression.kind === "symbol") {
    names.add(expression.name);
    if (expression.args !== undefined) calls.add(expression.name);
    expression.args?.forEach((argument) => {
      visit(argument, names, calls, literals, flags);
    });
  } else if (expression.kind === "terminal") {
    if (expression.literal !== undefined) literals.add(expression.literal);
  } else if (expression.kind === "seq") {
    expression.items.forEach((item) => {
      visit(item, names, calls, literals, flags);
    });
  } else if (expression.kind === "choice") {
    expression.alts.forEach((alternative) => {
      visit(alternative, names, calls, literals, flags);
    });
  } else if (
    expression.kind === "opt" ||
    expression.kind === "star" ||
    expression.kind === "plus" ||
    expression.kind === "predicate" ||
    expression.kind === "group"
  ) {
    if (expression.kind === "opt" || expression.kind === "star" || expression.kind === "plus") {
      flags.sugar = true;
    }
    visit(expression.expr, names, calls, literals, flags);
  }
};

const parse = (files: readonly SourceFile[]): FrontendResult => {
  const first = files[0];
  if (!first) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "MENHIR400_NO_INPUT",
      message: "the Menhir frontend requires at least one source file",
    };
    return { ir: null, diagnostics: [diagnostic] };
  }
  const declaration = declarations(first.content);
  const lexical = lexRules(first.content);
  const diagnostics = [...lexical.diagnostics];
  const declaredTerminalNames = new Set(
    declaration.terminals.flatMap((terminal) => (terminal.name ? [terminal.name] : [])),
  );
  const aliases = new Map(
    declaration.terminals.flatMap((terminal) =>
      terminal.name && terminal.literal !== undefined
        ? [[terminal.literal, terminal.name] as const]
        : [],
    ),
  );
  const parser = new RuleParser(lexical.tokens, diagnostics, declaredTerminalNames, aliases);
  const parsedRules = parser.parse(declaration.types);
  if (parsedRules.length === 0) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "MENHIR401_NO_RULES",
      message: "no Menhir rules could be parsed",
    };
    return { ir: null, diagnostics: [...diagnostics, diagnostic] };
  }
  if (files.length > 1) {
    diagnostics.push({
      severity: "warning",
      code: "MENHIR402_EXTRA_FILES_IGNORED",
      message: "the Menhir frontend uses only the first input file",
    });
  }
  const terminalNames = new Set(
    declaration.terminals.flatMap((terminal) => (terminal.name ? [terminal.name] : [])),
  );
  const ruleNames = new Set(parsedRules.map((rule) => rule.name));
  const references = new Set<string>();
  const calls = new Set<string>();
  const literals = new Set<string>();
  const flags = { sugar: false };
  parsedRules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach((item) => {
        visit(item, references, calls, literals, flags);
      });
    });
  });
  const stdlib = [...calls]
    .filter((name) => MENHIR_STDLIB_RULES.has(name) && !ruleNames.has(name))
    .sort();
  const builtinError = references.has("error") && !ruleNames.has("error");
  const externalNames = new Set([...stdlib, ...(builtinError ? ["error"] : [])]);
  const parameterNames = new Set(parsedRules.flatMap((rule) => rule.params ?? []));
  const unresolved = [...references]
    .filter(
      (name) =>
        !terminalNames.has(name) &&
        !ruleNames.has(name) &&
        !externalNames.has(name) &&
        !parameterNames.has(name),
    )
    .sort();
  diagnostics.push(
    ...unresolved.map(
      (name): Diagnostic => ({
        severity: "warning",
        code: "MENHIR300_UNRESOLVED_SYMBOL",
        message: `unresolved symbol ${name}`,
      }),
    ),
  );
  const terminals = [...declaration.terminals];
  literals.forEach((literal) => {
    if (!terminals.some((terminal) => terminal.literal === literal)) terminals.push({ literal });
  });
  const rules: GrammarIR["rules"] = parsedRules.map((rule) => ({
    name: rule.name,
    ...(rule.params ? { params: [...rule.params] } : {}),
    ...(rule.isInline ? { isInline: true } : {}),
    ...(rule.declaredType ? { declaredType: rule.declaredType } : {}),
    alternatives: [...rule.alternatives],
    loc: rule.loc,
  }));
  const ir: GrammarIR = {
    irVersion: IR_VERSION,
    source: {
      format: "menhir",
      dialect: "menhir",
      fileNames: [first.name],
      frontend: { id: FRONTEND_MENHIR_ID, version: FRONTEND_MENHIR_VERSION },
    },
    capabilities: {
      orderedChoice: false,
      ebnfSugar: flags.sugar,
      predicates: false,
      scannerless: false,
      precedenceTable: declaration.precedence.length > 0,
      parameterizedRules:
        parsedRules.some((rule) => (rule.params?.length ?? 0) > 0) || calls.size > 0,
      lexerRules: false,
    },
    startSymbols:
      declaration.startSymbols.length > 0
        ? declaration.startSymbols
        : rules[0]
          ? [rules[0].name]
          : [],
    terminals,
    externalSymbols: [
      ...stdlib.map((name) => ({ name, origin: "stdlib", kind: "rule" as const })),
      ...(builtinError ? [{ name: "error", origin: "builtin", kind: "terminal" as const }] : []),
    ],
    precedence: declaration.precedence,
    rules: mergeRulesByName(rules),
    diagnostics,
  };
  return { ir, diagnostics };
};

export const menhirFrontend: Frontend = {
  id: FRONTEND_MENHIR_ID,
  version: FRONTEND_MENHIR_VERSION,
  detect(fileName, head4k) {
    const extensionScore = /\.mly$/iu.test(fileName) ? 0.7 : 0;
    const signatureScore = Math.min(
      0.9,
      (/\b(?:separated_list|option)\s*\(/u.test(head4k) ? 0.25 : 0) +
        (/(?:^|\n)\s*%start\s+<[^>]+>/u.test(head4k) ? 0.35 : 0) +
        (/(?:^|\n)\s*%(?:public|inline)\b/u.test(head4k) ? 0.4 : 0) +
        (/(?:^|\n)\s*%(?:token|type)\b/u.test(head4k) ? 0.1 : 0),
    );
    return Math.min(1, extensionScore + signatureScore);
  },
  parse,
};
