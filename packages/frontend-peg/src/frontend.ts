import {
  type Diagnostic,
  type Expr,
  type Frontend,
  type FrontendResult,
  type GrammarIR,
  IR_VERSION,
  DEFAULT_MAX_NESTING_DEPTH,
  MAX_SUPPORTED_NESTING_DEPTH,
  mergeRulesByName,
  type SourceFile,
  type SourceSpan,
} from "@gramin/core";

export const FRONTEND_PEG_ID = "peggy";
export const FRONTEND_PEG_VERSION = "0.1.0";

type TokenKind =
  | "identifier"
  | "literal"
  | "class"
  | "assign"
  | "choice"
  | "lparen"
  | "rparen"
  | "question"
  | "star"
  | "plus"
  | "and"
  | "not"
  | "dot"
  | "colon"
  | "action"
  | "newline"
  | "eof";

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly loc: SourceSpan;
}

const span = (
  startLine: number,
  startCol: number,
  endLine = startLine,
  endCol = startCol + 1,
): SourceSpan => ({ startLine, startCol, endLine, endCol });

const lex = (source: string): { readonly tokens: Token[]; readonly diagnostics: Diagnostic[] } => {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let offset = 0;
  let line = 1;
  let col = 1;
  const advance = (): string => {
    const character = source[offset] ?? "";
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
  const opaqueBlock = (startLine: number, startCol: number): void => {
    let depth = 0;
    let quote = "";
    let escaped = false;
    const startedAt = offset;
    while (offset < source.length) {
      const character = advance();
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
      } else if (character === "'" || character === '"' || character === "`") {
        quote = character;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          push("action", String(offset - startedAt), startLine, startCol);
          return;
        }
      }
    }
    diagnostics.push({
      severity: "error",
      code: "PEG001_UNCLOSED_ACTION",
      message: "unclosed Peggy action or initializer",
      loc: span(startLine, startCol),
    });
    push("action", String(offset - startedAt), startLine, startCol);
  };

  while (offset < source.length) {
    const character = source[offset];
    if (character === " " || character === "\t" || character === "\r") {
      advance();
      continue;
    }
    if (character === "\n") {
      const startLine = line;
      const startCol = col;
      advance();
      push("newline", "\n", startLine, startCol);
      continue;
    }
    if (source.startsWith("//", offset)) {
      while (offset < source.length && source[offset] !== "\n") advance();
      continue;
    }
    if (source.startsWith("/*", offset)) {
      const startLine = line;
      const startCol = col;
      advance();
      advance();
      while (offset < source.length && !source.startsWith("*/", offset)) advance();
      if (offset < source.length) {
        advance();
        advance();
      } else {
        diagnostics.push({
          severity: "error",
          code: "PEG002_UNCLOSED_COMMENT",
          message: "unclosed block comment",
          loc: span(startLine, startCol),
        });
      }
      continue;
    }
    const startLine = line;
    const startCol = col;
    if (character === "{") {
      opaqueBlock(startLine, startCol);
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = advance();
      let value = "";
      let escaped = false;
      while (offset < source.length) {
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
      if (source[offset] === "i") advance();
      push("literal", value, startLine, startCol);
      continue;
    }
    if (character === "[") {
      advance();
      let value = "";
      let escaped = false;
      while (offset < source.length) {
        const current = advance();
        if (!escaped && current === "]") break;
        value += current;
        escaped = !escaped && current === "\\";
        if (current !== "\\") escaped = false;
      }
      if (source[offset] === "i") advance();
      push("class", value, startLine, startCol);
      continue;
    }
    const punctuation: Readonly<Record<string, TokenKind>> = {
      "=": "assign",
      "/": "choice",
      "(": "lparen",
      ")": "rparen",
      "?": "question",
      "*": "star",
      "+": "plus",
      "&": "and",
      "!": "not",
      ".": "dot",
      ":": "colon",
    };
    const kind = punctuation[character ?? ""];
    if (kind) {
      advance();
      push(kind, character ?? "", startLine, startCol);
      continue;
    }
    if (character && /[\p{L}_]/u.test(character)) {
      let value = "";
      while (offset < source.length && /[\p{L}\p{N}_]/u.test(source[offset] ?? "")) {
        value += advance();
      }
      push("identifier", value, startLine, startCol);
      continue;
    }
    diagnostics.push({
      severity: "warning",
      code: "PEG003_UNKNOWN_CHARACTER",
      message: `ignored unrecognized character ${JSON.stringify(character)}`,
      loc: span(startLine, startCol),
    });
    advance();
  }
  tokens.push({ kind: "eof", value: "", loc: span(line, col) });
  return { tokens, diagnostics };
};

interface PegRule {
  readonly name: string;
  readonly alternatives: readonly Expr[][];
  readonly ordered: boolean;
  readonly loc: SourceSpan;
}

class Parser {
  readonly diagnostics: Diagnostic[];
  readonly rules: PegRule[] = [];
  #index = 0;

  constructor(
    private readonly tokens: readonly Token[],
    diagnostics: readonly Diagnostic[],
    private readonly maxNestingDepth: number,
  ) {
    this.diagnostics = [...diagnostics];
  }

  parse(): readonly PegRule[] {
    while (this.current().kind !== "eof") {
      this.skipNewlinesAndActions();
      if (this.current().kind === "eof") break;
      if (!this.isRuleStart(this.#index)) {
        this.diagnostics.push({
          severity: "warning",
          code: "IR012_LOSSY_PEG_DECLARATION",
          message: "ignored a Peggy declaration or initializer",
          loc: this.current().loc,
        });
        this.#index += 1;
        continue;
      }
      this.parseRule();
    }
    return this.rules;
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

  private nextNonNewline(index: number): number {
    let cursor = index;
    while (this.tokens[cursor]?.kind === "newline") cursor += 1;
    return cursor;
  }

  private isRuleStart(index: number): boolean {
    const cursor = this.nextNonNewline(index);
    return (
      this.tokens[cursor]?.kind === "identifier" &&
      this.tokens[this.nextNonNewline(cursor + 1)]?.kind === "assign"
    );
  }

  private skipNewlinesAndActions(): void {
    while (this.current().kind === "newline" || this.current().kind === "action") {
      if (this.current().kind === "action") {
        this.diagnostics.push({
          severity: "info",
          code: "IR010_LOSSY_ACTION",
          message: "Peggy initializer or action code was omitted",
          loc: this.current().loc,
        });
      }
      this.#index += 1;
    }
  }

  private parseRule(): void {
    const name = this.current();
    this.#index = this.nextNonNewline(this.#index + 1) + 1;
    const parsed = this.parseChoice("eof", true);
    this.rules.push({
      name: name.value,
      alternatives: parsed.alternatives,
      ordered: parsed.usedChoice,
      loc: name.loc,
    });
  }

  private parseChoice(
    closing: TokenKind,
    stopAtRule: boolean,
    depth = 0,
  ): { readonly alternatives: Expr[][]; readonly usedChoice: boolean } {
    const alternatives: Expr[][] = [];
    let sequence: Expr[] = [];
    let usedChoice = false;
    while (this.current().kind !== closing && this.current().kind !== "eof") {
      if (this.current().kind === "newline") {
        const next = this.nextNonNewline(this.#index);
        if (stopAtRule && this.isRuleStart(next)) break;
        this.#index = next;
        continue;
      }
      if (this.current().kind === "choice") {
        alternatives.push(sequence);
        sequence = [];
        usedChoice = true;
        this.#index += 1;
        continue;
      }
      if (this.current().kind === "action") {
        this.diagnostics.push({
          severity: "info",
          code: "IR010_LOSSY_ACTION",
          message: "Peggy action code was omitted",
          loc: this.current().loc,
        });
        this.#index += 1;
        continue;
      }
      const expression = this.parseTerm(depth);
      if (expression) sequence.push(expression);
      else this.#index += 1;
    }
    alternatives.push(sequence);
    return { alternatives, usedChoice };
  }

  private parseTerm(depth: number): Expr | undefined {
    let label: string | undefined;
    if (this.current().kind === "identifier" && this.tokens[this.#index + 1]?.kind === "colon") {
      label = this.current().value;
      this.#index += 2;
    }
    const prefix = this.current();
    const predicate = prefix.kind === "and" || prefix.kind === "not";
    if (predicate) this.#index += 1;
    const token = this.current();
    let expression: Expr | undefined;
    if (token.kind === "identifier") {
      expression = {
        kind: "symbol",
        name: token.value,
        ...(label === undefined ? {} : { label }),
      };
      this.#index += 1;
    } else if (token.kind === "literal") {
      expression = { kind: "terminal", literal: token.value };
      this.#index += 1;
    } else if (token.kind === "class") {
      expression = {
        kind: "charClass",
        pattern: token.value.startsWith("^") ? token.value.slice(1) : token.value,
        ...(token.value.startsWith("^") ? { negated: true } : {}),
      };
      this.#index += 1;
    } else if (token.kind === "dot") {
      expression = { kind: "anyChar" };
      this.#index += 1;
    } else if (token.kind === "lparen") {
      if (depth >= this.maxNestingDepth) {
        this.diagnostics.push({
          severity: "error",
          code: "PEG101_NESTING_TOO_DEEP",
          message: `maximum nesting depth ${this.maxNestingDepth} exceeded`,
          loc: token.loc,
        });
        this.skipNested("rparen");
        expression = { kind: "seq", items: [] };
      } else {
        this.#index += 1;
        const nested = this.parseChoice("rparen", false, depth + 1);
        if (this.current().kind === "rparen") this.#index += 1;
        else {
          this.diagnostics.push({
            severity: "error",
            code: "PEG100_UNCLOSED_GROUP",
            message: "expected closing parenthesis",
            loc: token.loc,
          });
        }
        const alternatives = nested.alternatives.map(
          (items): Expr =>
            items.length === 1 ? (items[0] ?? { kind: "seq", items: [] }) : { kind: "seq", items },
        );
        const nestedExpression: Expr =
          alternatives.length === 1
            ? (alternatives[0] ?? { kind: "seq", items: [] })
            : { kind: "choice", ordered: true, alts: alternatives };
        expression = { kind: "group", expr: nestedExpression };
      }
    } else {
      return undefined;
    }
    if (label !== undefined && expression.kind !== "symbol") {
      this.diagnostics.push({
        severity: "info",
        code: "IR013_LOSSY_PEG_LABEL",
        message: `label ${label} on a non-symbol expression was omitted`,
        loc: token.loc,
      });
    }
    if (predicate) {
      expression = { kind: "predicate", positive: prefix.kind === "and", expr: expression };
    }
    const postfix = this.current().kind;
    if (postfix === "question" || postfix === "star" || postfix === "plus") {
      this.#index += 1;
      expression = {
        kind: postfix === "question" ? "opt" : postfix,
        expr: expression,
      };
    }
    return expression;
  }

  private skipNested(closing: TokenKind): void {
    let depth = 1;
    this.#index += 1;
    while (depth > 0 && this.current().kind !== "eof") {
      if (this.current().kind === "lparen") depth += 1;
      if (this.current().kind === closing) depth -= 1;
      this.#index += 1;
    }
  }
}

const visit = (
  expression: Expr,
  references: Set<string>,
  literals: Set<string>,
  flags: { scannerless: boolean; predicates: boolean; sugar: boolean; ordered: boolean },
): void => {
  if (expression.kind === "symbol") references.add(expression.name);
  if (expression.kind === "terminal" && expression.literal !== undefined) {
    literals.add(expression.literal);
  }
  if (expression.kind === "charClass" || expression.kind === "anyChar") flags.scannerless = true;
  if (expression.kind === "predicate") flags.predicates = true;
  if (expression.kind === "opt" || expression.kind === "star" || expression.kind === "plus") {
    flags.sugar = true;
  }
  if (expression.kind === "choice" && expression.ordered) flags.ordered = true;
  if (expression.kind === "seq") {
    expression.items.forEach((item) => {
      visit(item, references, literals, flags);
    });
  } else if (expression.kind === "choice") {
    expression.alts.forEach((alternative) => {
      visit(alternative, references, literals, flags);
    });
  } else if (
    expression.kind === "opt" ||
    expression.kind === "star" ||
    expression.kind === "plus" ||
    expression.kind === "predicate" ||
    expression.kind === "group"
  ) {
    visit(expression.expr, references, literals, flags);
  }
};

const parse = (
  files: readonly SourceFile[],
  options: { readonly maxNestingDepth?: number },
): FrontendResult => {
  const first = files[0];
  if (!first) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "PEG400_NO_INPUT",
      message: "the Peggy frontend requires at least one source file",
    };
    return { ir: null, diagnostics: [diagnostic] };
  }
  const lexical = lex(first.content);
  const parser = new Parser(
    lexical.tokens,
    lexical.diagnostics,
    Math.min(options.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH, MAX_SUPPORTED_NESTING_DEPTH),
  );
  const parsedRules = parser.parse();
  if (parser.diagnostics.some((diagnostic) => diagnostic.code === "PEG101_NESTING_TOO_DEEP")) {
    return { ir: null, diagnostics: parser.diagnostics };
  }
  if (parsedRules.length === 0) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "PEG401_NO_RULES",
      message: "no Peggy rules could be parsed",
    };
    return { ir: null, diagnostics: [...parser.diagnostics, diagnostic] };
  }
  const references = new Set<string>();
  const literals = new Set<string>();
  const flags = {
    scannerless: false,
    predicates: false,
    sugar: false,
    ordered: parsedRules.some((rule) => rule.ordered),
  };
  parsedRules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      alternative.forEach((expression) => {
        visit(expression, references, literals, flags);
      });
    });
  });
  const names = new Set(parsedRules.map((rule) => rule.name));
  const unresolved = [...references].filter((name) => !names.has(name)).sort();
  const diagnostics: Diagnostic[] = [
    ...parser.diagnostics,
    ...unresolved.map(
      (name): Diagnostic => ({
        severity: "warning",
        code: "PEG300_UNRESOLVED_SYMBOL",
        message: `unresolved symbol ${name}`,
      }),
    ),
    ...(files.length > 1
      ? [
          {
            severity: "warning" as const,
            code: "PEG402_EXTRA_FILES_IGNORED",
            message: "the Peggy frontend uses only the first input file",
          },
        ]
      : []),
  ];
  const ir: GrammarIR = {
    irVersion: IR_VERSION,
    source: {
      format: "peg",
      dialect: "peggy",
      fileNames: [first.name],
      frontend: { id: FRONTEND_PEG_ID, version: FRONTEND_PEG_VERSION },
    },
    capabilities: {
      orderedChoice: flags.ordered,
      ebnfSugar: flags.sugar,
      predicates: flags.predicates,
      scannerless: flags.scannerless,
      precedenceTable: false,
      parameterizedRules: false,
      lexerRules: false,
    },
    startSymbols: parsedRules[0] ? [parsedRules[0].name] : [],
    terminals: [...literals].sort().map((literal) => ({ literal })),
    externalSymbols: unresolved.map((name) => ({
      name,
      origin: "unresolved",
      kind: "unknown" as const,
    })),
    precedence: [],
    rules: mergeRulesByName(
      parsedRules.map((rule) => ({
        name: rule.name,
        ...(rule.ordered ? { orderedAlternatives: true } : {}),
        alternatives: rule.alternatives.map((items) => ({ items })),
        loc: rule.loc,
      })),
    ),
    diagnostics,
  };
  return { ir, diagnostics };
};

export const pegFrontend: Frontend = {
  id: FRONTEND_PEG_ID,
  version: FRONTEND_PEG_VERSION,
  detect(fileName, head4k) {
    const extensionScore = /\.(?:pegjs|peggy|peg)$/iu.test(fileName) ? 0.65 : 0;
    const signatureScore = /(?:^|\n)\s*[\p{L}_][\p{L}\p{N}_]*\s*=/u.test(head4k) ? 0.35 : 0;
    return Math.min(1, extensionScore + signatureScore);
  },
  parse,
};
