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

export const FRONTEND_BNF_ID = "bnf";
export const FRONTEND_BNF_VERSION = "0.1.0";

type TokenKind =
  | "identifier"
  | "literal"
  | "assign"
  | "pipe"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "lbrace"
  | "rbrace"
  | "question"
  | "star"
  | "plus"
  | "semi"
  | "newline"
  | "eof";

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly loc: SourceSpan;
}

interface LexResult {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
}

const pointSpan = (line: number, col: number, width = 1): SourceSpan => ({
  startLine: line,
  startCol: col,
  endLine: line,
  endCol: col + Math.max(width, 1),
});

const lex = (source: string): LexResult => {
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
    tokens.push({
      kind,
      value,
      loc: {
        startLine,
        startCol,
        endLine: line,
        endCol: col,
      },
    });
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
    if (character === "#" || (character === "/" && source[offset + 1] === "/")) {
      while (offset < source.length && source[offset] !== "\n") advance();
      continue;
    }
    if (character === "(" && source[offset + 1] === "*") {
      const startLine = line;
      const startCol = col;
      advance();
      advance();
      while (offset < source.length && !(source[offset] === "*" && source[offset + 1] === ")")) {
        advance();
      }
      if (offset >= source.length) {
        diagnostics.push({
          severity: "error",
          code: "BNF001_UNCLOSED_COMMENT",
          message: "unclosed EBNF comment",
          loc: pointSpan(startLine, startCol, 2),
        });
      } else {
        advance();
        advance();
      }
      continue;
    }
    const startLine = line;
    const startCol = col;
    if (source.startsWith("::=", offset)) {
      advance();
      advance();
      advance();
      push("assign", "::=", startLine, startCol);
      continue;
    }
    if (character === "=") {
      advance();
      push("assign", "=", startLine, startCol);
      continue;
    }
    const punctuation: Readonly<Record<string, TokenKind>> = {
      "|": "pipe",
      "(": "lparen",
      ")": "rparen",
      "[": "lbracket",
      "]": "rbracket",
      "{": "lbrace",
      "}": "rbrace",
      "?": "question",
      "*": "star",
      "+": "plus",
      ";": "semi",
    };
    const punctuationKind = punctuation[character ?? ""];
    if (punctuationKind) {
      advance();
      push(punctuationKind, character ?? "", startLine, startCol);
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = advance();
      let value = "";
      let closed = false;
      while (offset < source.length) {
        const current = advance();
        if (current === "\\") {
          const escaped = advance();
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        } else if (current === quote) {
          closed = true;
          break;
        } else {
          value += current;
        }
      }
      if (!closed) {
        diagnostics.push({
          severity: "error",
          code: "BNF002_UNCLOSED_LITERAL",
          message: "unclosed terminal literal",
          loc: pointSpan(startLine, startCol),
        });
      }
      push("literal", value, startLine, startCol);
      continue;
    }
    if (character === "<") {
      advance();
      let value = "";
      while (offset < source.length && source[offset] !== ">" && source[offset] !== "\n") {
        value += advance();
      }
      if (source[offset] === ">") {
        advance();
      } else {
        diagnostics.push({
          severity: "error",
          code: "BNF003_UNCLOSED_SYMBOL",
          message: "unclosed angle-bracket symbol",
          loc: pointSpan(startLine, startCol),
        });
      }
      push("identifier", value.trim(), startLine, startCol);
      continue;
    }
    if (character && /[\p{L}_]/u.test(character)) {
      let value = "";
      while (offset < source.length && /[\p{L}\p{N}_.-]/u.test(source[offset] ?? "")) {
        value += advance();
      }
      push("identifier", value, startLine, startCol);
      continue;
    }

    diagnostics.push({
      severity: "warning",
      code: "BNF004_UNKNOWN_CHARACTER",
      message: `ignored unrecognized character ${JSON.stringify(character)}`,
      loc: pointSpan(startLine, startCol),
    });
    advance();
  }
  tokens.push({ kind: "eof", value: "", loc: pointSpan(line, col) });
  return { tokens, diagnostics };
};

interface ParsedRule {
  readonly name: string;
  readonly alternatives: readonly Expr[][];
  readonly loc: SourceSpan;
}

class Parser {
  readonly diagnostics: Diagnostic[];
  readonly rules: ParsedRule[] = [];
  #index = 0;
  #nestingDepth = 0;

  constructor(
    private readonly tokens: readonly Token[],
    diagnostics: readonly Diagnostic[],
    private readonly maxNestingDepth: number,
  ) {
    this.diagnostics = [...diagnostics];
  }

  parse(): readonly ParsedRule[] {
    while (this.current().kind !== "eof") {
      this.skipSeparators();
      if (this.current().kind === "eof") break;
      if (!this.isRuleStart(this.#index)) {
        this.error("BNF100_EXPECTED_RULE", "expected a rule name followed by ::= or =");
        this.recoverToRule();
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
        loc: pointSpan(1, 1),
      }
    );
  }

  private nextNonNewline(index: number): number {
    let cursor = index;
    while (this.tokens[cursor]?.kind === "newline") cursor += 1;
    return cursor;
  }

  private isRuleStart(index: number): boolean {
    const firstIndex = this.nextNonNewline(index);
    if (this.tokens[firstIndex]?.kind !== "identifier") return false;
    return this.tokens[this.nextNonNewline(firstIndex + 1)]?.kind === "assign";
  }

  private skipSeparators(): void {
    while (this.current().kind === "newline" || this.current().kind === "semi") this.#index += 1;
  }

  private parseRule(): void {
    const name = this.current();
    this.#index = this.nextNonNewline(this.#index + 1);
    this.#index += 1;
    const alternatives = this.parseChoice(new Set(["semi", "eof"]));
    this.rules.push({
      name: name.value,
      alternatives: alternatives.length > 0 ? alternatives : [[]],
      loc: {
        ...name.loc,
        endLine: this.current().loc.endLine,
        endCol: this.current().loc.endCol,
      },
    });
    if (this.current().kind === "semi") this.#index += 1;
  }

  private parseChoice(stops: ReadonlySet<TokenKind>): Expr[][] {
    const alternatives: Expr[][] = [];
    let sequence: Expr[] = [];
    while (!stops.has(this.current().kind)) {
      if (this.current().kind === "newline") {
        const next = this.nextNonNewline(this.#index);
        if (this.isRuleStart(next)) break;
        this.#index = next;
        continue;
      }
      if (this.current().kind === "pipe") {
        alternatives.push(sequence);
        sequence = [];
        this.#index += 1;
        continue;
      }
      const expression = this.parseTerm();
      if (expression) sequence.push(expression);
      else this.#index += 1;
    }
    alternatives.push(sequence);
    return alternatives;
  }

  private parseTerm(): Expr | undefined {
    const token = this.current();
    let expression: Expr | undefined;
    if (token.kind === "identifier") {
      expression = { kind: "symbol", name: token.value };
      this.#index += 1;
    } else if (token.kind === "literal") {
      expression = { kind: "terminal", literal: token.value };
      this.#index += 1;
    } else if (token.kind === "lparen") {
      expression = { kind: "group", expr: this.parseNested("rparen") };
    } else if (token.kind === "lbracket") {
      expression = { kind: "opt", expr: this.parseNested("rbracket") };
    } else if (token.kind === "lbrace") {
      expression = { kind: "star", expr: this.parseNested("rbrace") };
    } else {
      this.error("BNF101_UNEXPECTED_TOKEN", `unexpected token ${token.value || token.kind}`);
      return undefined;
    }

    const postfix = this.current().kind;
    if (postfix === "question" || postfix === "star" || postfix === "plus") {
      this.#index += 1;
      return {
        kind: postfix === "question" ? "opt" : postfix,
        expr: expression,
      };
    }
    return expression;
  }

  private parseNested(closing: TokenKind): Expr {
    if (this.#nestingDepth >= this.maxNestingDepth) {
      this.error(
        "BNF103_NESTING_TOO_DEEP",
        `maximum nesting depth ${this.maxNestingDepth} exceeded`,
      );
      this.skipNested(closing);
      return { kind: "seq", items: [] };
    }
    this.#index += 1;
    this.#nestingDepth += 1;
    const alternatives = this.parseChoice(new Set([closing, "eof"]));
    this.#nestingDepth -= 1;
    if (this.current().kind === closing) {
      this.#index += 1;
    } else {
      this.error("BNF102_UNCLOSED_GROUP", `expected closing ${closing}`);
    }
    const expressions = alternatives.map(
      (items): Expr =>
        items.length === 1 ? (items[0] ?? { kind: "seq", items: [] }) : { kind: "seq", items },
    );
    return expressions.length === 1
      ? (expressions[0] ?? { kind: "seq", items: [] })
      : { kind: "choice", ordered: false, alts: expressions };
  }

  private skipNested(closing: TokenKind): void {
    const expected: TokenKind[] = [closing];
    this.#index += 1;
    while (expected.length > 0 && this.current().kind !== "eof") {
      const token = this.current();
      const nestedClosing =
        token.kind === "lparen"
          ? "rparen"
          : token.kind === "lbracket"
            ? "rbracket"
            : token.kind === "lbrace"
              ? "rbrace"
              : undefined;
      if (nestedClosing) {
        expected.push(nestedClosing);
      } else if (token.kind === expected.at(-1)) {
        expected.pop();
      }
      this.#index += 1;
    }
  }

  private error(code: string, message: string): void {
    this.diagnostics.push({
      severity: "error",
      code,
      message,
      loc: this.current().loc,
    });
  }

  private recoverToRule(): void {
    do {
      this.#index += 1;
    } while (this.current().kind !== "eof" && !this.isRuleStart(this.#index));
  }
}

const collectSymbols = (expression: Expr, symbols: Set<string>, literals: Set<string>): void => {
  if (expression.kind === "symbol") {
    symbols.add(expression.name);
    expression.args?.forEach((argument) => {
      collectSymbols(argument, symbols, literals);
    });
  } else if (expression.kind === "terminal") {
    if (expression.literal !== undefined) literals.add(expression.literal);
  } else if (expression.kind === "seq") {
    expression.items.forEach((item) => {
      collectSymbols(item, symbols, literals);
    });
  } else if (expression.kind === "choice") {
    expression.alts.forEach((alternative) => {
      collectSymbols(alternative, symbols, literals);
    });
  } else if (
    expression.kind === "opt" ||
    expression.kind === "star" ||
    expression.kind === "plus" ||
    expression.kind === "predicate" ||
    expression.kind === "group"
  ) {
    collectSymbols(expression.expr, symbols, literals);
  }
};

const hasNestedKind = (expression: Expr, kinds: ReadonlySet<Expr["kind"]>): boolean => {
  if (kinds.has(expression.kind)) return true;
  if (expression.kind === "seq") return expression.items.some((item) => hasNestedKind(item, kinds));
  if (expression.kind === "choice") {
    return expression.alts.some((alternative) => hasNestedKind(alternative, kinds));
  }
  if (
    expression.kind === "opt" ||
    expression.kind === "star" ||
    expression.kind === "plus" ||
    expression.kind === "predicate" ||
    expression.kind === "group"
  ) {
    return hasNestedKind(expression.expr, kinds);
  }
  return false;
};

const lower = (
  file: SourceFile,
  rules: readonly ParsedRule[],
  diagnostics: Diagnostic[],
  dialect: string,
): GrammarIR => {
  const ruleNames = new Set(rules.map((rule) => rule.name));
  const referenced = new Set<string>();
  const literals = new Set<string>();
  rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      alternative.forEach((item) => {
        collectSymbols(item, referenced, literals);
      });
    });
  });
  const unresolved = [...referenced].filter((name) => !ruleNames.has(name)).sort();
  diagnostics.push(
    ...unresolved.map(
      (name): Diagnostic => ({
        severity: "warning",
        code: "BNF300_UNRESOLVED_SYMBOL",
        message: `unresolved symbol ${name}`,
      }),
    ),
  );
  const expressions = rules.flatMap((rule) => rule.alternatives.flat());
  return {
    irVersion: IR_VERSION,
    source: {
      format: "bnf",
      dialect,
      fileNames: [file.name],
      frontend: { id: FRONTEND_BNF_ID, version: FRONTEND_BNF_VERSION },
    },
    capabilities: {
      orderedChoice: false,
      ebnfSugar: expressions.some((expression) =>
        hasNestedKind(expression, new Set(["opt", "star", "plus"])),
      ),
      predicates: false,
      scannerless: false,
      precedenceTable: false,
      parameterizedRules: false,
      lexerRules: false,
    },
    startSymbols: rules[0] ? [rules[0].name] : [],
    terminals: [...literals].sort().map((literal) => ({ literal })),
    externalSymbols: unresolved.map((name) => ({
      name,
      origin: "unresolved",
      kind: "unknown" as const,
    })),
    precedence: [],
    rules: mergeRulesByName(
      rules.map((rule) => ({
        name: rule.name,
        alternatives: rule.alternatives.map((items) => ({ items, loc: rule.loc })),
        loc: rule.loc,
      })),
    ),
    diagnostics,
  };
};

const parse = (
  files: readonly SourceFile[],
  options: { readonly dialect?: string; readonly maxNestingDepth?: number },
): FrontendResult => {
  const first = files[0];
  if (!first) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "BNF400_NO_INPUT",
      message: "the BNF frontend requires at least one source file",
    };
    return { ir: null, diagnostics: [diagnostic] };
  }
  const lexical = lex(first.content);
  const parser = new Parser(
    lexical.tokens,
    lexical.diagnostics,
    Math.min(options.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH, MAX_SUPPORTED_NESTING_DEPTH),
  );
  const rules = parser.parse();
  if (parser.diagnostics.some((diagnostic) => diagnostic.code === "BNF103_NESTING_TOO_DEEP")) {
    return { ir: null, diagnostics: parser.diagnostics };
  }
  if (rules.length === 0) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "BNF401_NO_RULES",
      message: "no BNF rules could be parsed",
    };
    return { ir: null, diagnostics: [...parser.diagnostics, diagnostic] };
  }
  const dialect =
    options.dialect ?? (lexical.tokens.some((token) => token.value === "::=") ? "bnf" : "ebnf");
  const diagnostics = [
    ...parser.diagnostics,
    ...(files.length > 1
      ? [
          {
            severity: "warning" as const,
            code: "BNF402_EXTRA_FILES_IGNORED",
            message: "the BNF frontend uses only the first input file",
          },
        ]
      : []),
  ];
  const ir = lower(first, rules, diagnostics, dialect);
  return { ir, diagnostics };
};

export const bnfFrontend: Frontend = {
  id: FRONTEND_BNF_ID,
  version: FRONTEND_BNF_VERSION,
  detect(fileName, head4k) {
    const extensionScore = /\.(?:bnf|ebnf)$/iu.test(fileName) ? 0.65 : 0;
    const signatureScore = /(?:<[^>\n]+>|[\p{L}_][\p{L}\p{N}_.-]*)\s*(?:::)?=/u.test(head4k)
      ? 0.35
      : 0;
    return Math.min(1, extensionScore + signatureScore);
  },
  parse,
};
