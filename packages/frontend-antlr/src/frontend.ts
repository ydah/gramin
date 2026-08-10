import {
  type Alternative,
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
  type TerminalDecl,
} from "@gramin/core";

export const FRONTEND_ANTLR_ID = "antlr4";
export const FRONTEND_ANTLR_VERSION = "0.1.0";

type TokenKind =
  | "identifier"
  | "literal"
  | "charSet"
  | "action"
  | "colon"
  | "semi"
  | "pipe"
  | "lparen"
  | "rparen"
  | "question"
  | "star"
  | "plus"
  | "assign"
  | "plusAssign"
  | "hash"
  | "not"
  | "dot"
  | "arrow"
  | "comma"
  | "at"
  | "other"
  | "eof";

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly loc: SourceSpan;
}

interface SourceTokens {
  readonly file: SourceFile;
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
  readonly grammarName?: string;
  readonly tokenVocab?: string;
  readonly imports: readonly string[];
}

interface RawRule {
  readonly name: string;
  readonly fragment: boolean;
  readonly lexer: boolean;
  readonly body: readonly Token[];
  readonly loc: SourceSpan;
  readonly fileName: string;
  readonly grammarName?: string;
}

const span = (
  startLine: number,
  startCol: number,
  endLine = startLine,
  endCol = startCol + 1,
): SourceSpan => ({ startLine, startCol, endLine, endCol });

const decodeLiteral = (source: string): string => {
  let value = "";
  for (let index = 1; index < source.length - 1; index += 1) {
    const character = source[index];
    if (character === "\\" && index + 1 < source.length - 1) {
      index += 1;
      const escaped = source[index];
      value += escaped === "n" ? "\n" : escaped === "r" ? "\r" : escaped === "t" ? "\t" : escaped;
    } else {
      value += character ?? "";
    }
  }
  return value;
};

const lex = (file: SourceFile): SourceTokens => {
  const source = file.content;
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

  while (offset < source.length) {
    const character = source[offset];
    if (character && /\s/u.test(character)) {
      advance();
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
          code: "ANTLR001_UNCLOSED_COMMENT",
          message: "unclosed ANTLR block comment",
          loc: span(startLine, startCol),
        });
      }
      continue;
    }
    const startLine = line;
    const startCol = col;
    if (character === "'" || character === '"') {
      const quote = advance();
      let raw = quote;
      let escaped = false;
      while (offset < source.length) {
        const current = advance();
        raw += current;
        if (escaped) escaped = false;
        else if (current === "\\") escaped = true;
        else if (current === quote) break;
      }
      push("literal", raw, startLine, startCol);
      continue;
    }
    if (character === "[") {
      let raw = advance();
      let escaped = false;
      while (offset < source.length) {
        const current = advance();
        raw += current;
        if (!escaped && current === "]") break;
        escaped = !escaped && current === "\\";
        if (current !== "\\") escaped = false;
      }
      push("charSet", raw.slice(1, -1), startLine, startCol);
      continue;
    }
    if (character === "{") {
      let raw = "";
      let depth = 0;
      let quote = "";
      let escaped = false;
      while (offset < source.length) {
        const current = advance();
        raw += current;
        if (quote) {
          if (escaped) escaped = false;
          else if (current === "\\") escaped = true;
          else if (current === quote) quote = "";
        } else if (current === "'" || current === '"' || current === "`") {
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
          code: "ANTLR002_UNCLOSED_ACTION",
          message: "unclosed ANTLR action or options block",
          loc: span(startLine, startCol),
        });
      }
      push("action", raw, startLine, startCol);
      continue;
    }
    if (source.startsWith("+=", offset)) {
      advance();
      advance();
      push("plusAssign", "+=", startLine, startCol);
      continue;
    }
    if (source.startsWith("->", offset)) {
      advance();
      advance();
      push("arrow", "->", startLine, startCol);
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
    const punctuation: Readonly<Record<string, TokenKind>> = {
      ":": "colon",
      ";": "semi",
      "|": "pipe",
      "(": "lparen",
      ")": "rparen",
      "?": "question",
      "*": "star",
      "+": "plus",
      "=": "assign",
      "#": "hash",
      "~": "not",
      ".": "dot",
      ",": "comma",
      "@": "at",
    };
    const kind = punctuation[character ?? ""] ?? "other";
    advance();
    push(kind, character ?? "", startLine, startCol);
  }
  tokens.push({ kind: "eof", value: "", loc: span(line, col) });
  const grammarMatch =
    /(?:^|\n)\s*(?:parser\s+|lexer\s+)?grammar\s+([\p{L}_][\p{L}\p{N}_]*)\s*;/u.exec(source);
  const tokenVocabMatch = /\btokenVocab\s*=\s*([\p{L}_][\p{L}\p{N}_]*)/u.exec(source);
  const imports = [...source.matchAll(/\bimport\s+([^;]+);/gu)].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
  return {
    file,
    tokens,
    diagnostics,
    ...(grammarMatch?.[1] ? { grammarName: grammarMatch[1] } : {}),
    ...(tokenVocabMatch?.[1] ? { tokenVocab: tokenVocabMatch[1] } : {}),
    imports,
  };
};

const collectRules = (source: SourceTokens): RawRule[] => {
  const rules: RawRule[] = [];
  const tokens = source.tokens;
  let index = 0;
  const declarations = new Set([
    "grammar",
    "parser",
    "lexer",
    "options",
    "tokens",
    "channels",
    "import",
    "mode",
    "catch",
    "finally",
  ]);
  while (index < tokens.length && tokens[index]?.kind !== "eof") {
    let fragment = false;
    let nameIndex = index;
    if (
      tokens[index]?.kind === "identifier" &&
      tokens[index]?.value === "fragment" &&
      tokens[index + 1]?.kind === "identifier"
    ) {
      fragment = true;
      nameIndex = index + 1;
    }
    const name = tokens[nameIndex];
    if (name?.kind !== "identifier") {
      index += 1;
      continue;
    }
    if (declarations.has(name.value)) {
      index += 1;
      continue;
    }
    let cursor = nameIndex + 1;
    let depth = 0;
    let colonIndex = -1;
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (!token || token.kind === "eof") break;
      if (token.kind === "lparen") depth += 1;
      if (token.kind === "rparen") depth -= 1;
      if (depth === 0 && token.kind === "colon") {
        colonIndex = cursor;
        break;
      }
      if (depth === 0 && token.kind === "semi") break;
      cursor += 1;
    }
    if (colonIndex < 0) {
      index = Math.max(cursor + 1, index + 1);
      continue;
    }
    cursor = colonIndex + 1;
    depth = 0;
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (!token || token.kind === "eof") break;
      if (token.kind === "lparen") depth += 1;
      if (token.kind === "rparen") depth -= 1;
      if (depth === 0 && token.kind === "semi") break;
      cursor += 1;
    }
    const lexerRule = /^[\p{Lu}_]/u.test(name.value);
    rules.push({
      name: name.value,
      fragment,
      lexer: lexerRule,
      body: tokens.slice(colonIndex + 1, cursor),
      loc: name.loc,
      fileName: source.file.name,
      ...(source.grammarName ? { grammarName: source.grammarName } : {}),
    });
    index = cursor + 1;
  }
  return rules;
};

class ExpressionParser {
  #index = 0;
  readonly diagnostics: Diagnostic[];
  readonly implicitLiterals = new Set<string>();
  readonly references = new Set<string>();
  readonly terminalReferences = new Set<string>();

  constructor(
    private readonly tokens: readonly Token[],
    diagnostics: Diagnostic[],
    private readonly aliases: ReadonlyMap<string, string>,
    private readonly maxNestingDepth: number,
  ) {
    this.diagnostics = diagnostics;
  }

  alternatives(closing: TokenKind | "end" = "end", depth = 0): Alternative[] {
    const alternatives: Alternative[] = [];
    let items: Expr[] = [];
    let label: string | undefined;
    while (this.current()?.kind !== closing && this.current() !== undefined) {
      const token = this.current();
      if (!token) break;
      if (token.kind === "pipe") {
        alternatives.push({ items, ...(label ? { label } : {}) });
        items = [];
        label = undefined;
        this.#index += 1;
        continue;
      }
      if (token.kind === "hash") {
        const name = this.tokens[this.#index + 1];
        if (name?.kind === "identifier") label = name.value;
        this.#index += name ? 2 : 1;
        continue;
      }
      if (token.kind === "arrow") break;
      const before = this.#index;
      const expression = this.term(depth);
      if (expression?.kind === "group" && expression.expr.kind === "seq") {
        items.push(...expression.expr.items);
      } else if (expression?.kind === "group" && expression.expr.kind !== "choice") {
        items.push(expression.expr);
      } else if (expression) {
        items.push(expression);
      } else if (this.#index === before) this.#index += 1;
    }
    alternatives.push({ items, ...(label ? { label } : {}) });
    return alternatives;
  }

  private current(): Token | undefined {
    return this.tokens[this.#index];
  }

  private term(depth: number): Expr | undefined {
    let label: string | undefined;
    if (
      this.current()?.kind === "identifier" &&
      (this.tokens[this.#index + 1]?.kind === "assign" ||
        this.tokens[this.#index + 1]?.kind === "plusAssign")
    ) {
      label = this.current()?.value;
      this.#index += 2;
    }
    const negated = this.current()?.kind === "not";
    if (negated) {
      const negationLocation = this.current()?.loc;
      this.diagnostics.push({
        severity: "info",
        code: "IR015_LOSSY_ANTLR_NEGATION",
        message: "ANTLR token or character-set negation was approximated",
        ...(negationLocation ? { loc: negationLocation } : {}),
      });
      this.#index += 1;
    }
    const token = this.current();
    if (!token) return undefined;
    let expression: Expr | undefined;
    if (token.kind === "identifier") {
      if (/^[\p{Lu}_]/u.test(token.value)) {
        this.terminalReferences.add(token.value);
        expression = { kind: "terminal", name: token.value };
      } else {
        this.references.add(token.value);
        expression = {
          kind: "symbol",
          name: token.value,
          ...(label ? { label } : {}),
        };
      }
      this.#index += 1;
    } else if (token.kind === "literal") {
      const literal = decodeLiteral(token.value);
      const alias = this.aliases.get(literal);
      if (alias) {
        this.terminalReferences.add(alias);
        expression = { kind: "terminal", name: alias, literal };
      } else {
        this.implicitLiterals.add(literal);
        expression = { kind: "terminal", literal };
      }
      this.#index += 1;
    } else if (token.kind === "lparen") {
      if (depth >= this.maxNestingDepth) {
        this.diagnostics.push({
          severity: "error",
          code: "ANTLR003_NESTING_TOO_DEEP",
          message: `maximum nesting depth ${this.maxNestingDepth} exceeded`,
          loc: token.loc,
        });
        this.skipNested("rparen");
        expression = { kind: "seq", items: [] };
      } else {
        this.#index += 1;
        const nested = this.alternatives("rparen", depth + 1);
        if (this.current()?.kind === "rparen") this.#index += 1;
        const expressions = nested.map(
          ({ items }): Expr =>
            items.length === 1 ? (items[0] ?? { kind: "seq", items: [] }) : { kind: "seq", items },
        );
        expression = {
          kind: "group",
          expr:
            expressions.length === 1
              ? (expressions[0] ?? { kind: "seq", items: [] })
              : { kind: "choice", ordered: false, alts: expressions },
        };
      }
    } else if (token.kind === "action") {
      const predicate = this.tokens[this.#index + 1]?.kind === "question";
      this.diagnostics.push({
        severity: "info",
        code: predicate ? "IR011_LOSSY_SEMANTIC_PREDICATE" : "IR010_LOSSY_ACTION",
        message: predicate
          ? "ANTLR semantic predicate code was omitted"
          : "ANTLR embedded action code was omitted",
        loc: token.loc,
      });
      this.#index += predicate ? 2 : 1;
      return undefined;
    } else if (token.kind === "dot") {
      this.terminalReferences.add("ANY_TOKEN");
      expression = { kind: "terminal", name: "ANY_TOKEN" };
      this.#index += 1;
    } else {
      return undefined;
    }
    const postfix = this.current()?.kind;
    if (postfix === "question" || postfix === "star" || postfix === "plus") {
      this.#index += 1;
      expression = {
        kind: postfix === "question" ? "opt" : postfix,
        expr: expression,
      };
      if (this.current()?.kind === "question") this.#index += 1;
    }
    return expression;
  }

  private skipNested(closing: TokenKind): void {
    let depth = 1;
    this.#index += 1;
    while (depth > 0 && this.current()?.kind !== "eof") {
      if (this.current()?.kind === "lparen") depth += 1;
      if (this.current()?.kind === closing) depth -= 1;
      this.#index += 1;
    }
  }
}

const terminalKey = (terminal: TerminalDecl): string =>
  terminal.name === undefined ? `literal:${terminal.literal}` : `name:${terminal.name}`;

const hasSugar = (expression: Expr): boolean => {
  if (expression.kind === "opt" || expression.kind === "star" || expression.kind === "plus") {
    return true;
  }
  if (expression.kind === "seq") return expression.items.some(hasSugar);
  if (expression.kind === "choice") return expression.alts.some(hasSugar);
  if (expression.kind === "predicate" || expression.kind === "group") {
    return hasSugar(expression.expr);
  }
  if (expression.kind === "symbol") return expression.args?.some(hasSugar) ?? false;
  return false;
};

const parse = (
  files: readonly SourceFile[],
  options: { readonly maxNestingDepth?: number },
): FrontendResult => {
  if (files.length === 0) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "ANTLR400_NO_INPUT",
      message: "the ANTLR frontend requires at least one source file",
    };
    return { ir: null, diagnostics: [diagnostic] };
  }
  const sources = files.map(lex);
  const rawRules = sources.flatMap(collectRules);
  const diagnostics: Diagnostic[] = sources.flatMap((source) => source.diagnostics);
  files.forEach((file) => {
    if (/@(?:header|members|parser::members|lexer::members)\b/u.test(file.content)) {
      diagnostics.push({
        severity: "info",
        code: "IR010_LOSSY_ACTION",
        message: `grammar-level action code in ${file.name} was omitted`,
      });
    }
  });
  const primary = sources[0];
  const importedGrammarNames = new Set([
    ...(primary?.imports ?? []),
    ...(primary?.tokenVocab ? [primary.tokenVocab] : []),
  ]);

  const terminals = new Map<string, TerminalDecl>();
  const aliases = new Map<string, string>();
  const externalSymbols = new Map<string, GrammarIR["externalSymbols"][number]>();
  rawRules
    .filter((rule) => rule.lexer)
    .forEach((rule) => {
      if (rule.fragment) {
        diagnostics.push({
          severity: "info",
          code: "IR016_LOSSY_ANTLR_FRAGMENT",
          message: `fragment ${rule.name} was excluded from terminals`,
          loc: rule.loc,
        });
        return;
      }
      const meaningful = rule.body.filter(
        (token) => token.kind !== "action" && token.kind !== "arrow",
      );
      const literal =
        meaningful.length === 1 && meaningful[0]?.kind === "literal"
          ? decodeLiteral(meaningful[0].value)
          : undefined;
      const terminal: TerminalDecl = {
        name: rule.name,
        ...(literal === undefined ? {} : { literal }),
        loc: rule.loc,
      };
      terminals.set(terminalKey(terminal), terminal);
      if (literal !== undefined) aliases.set(literal, rule.name);
      if (rule.grammarName && importedGrammarNames.has(rule.grammarName)) {
        externalSymbols.set(rule.name, {
          name: rule.name,
          origin: "import",
          kind: "terminal",
        });
      }
      rule.body
        .filter((token) => token.kind === "action")
        .forEach((token) => {
          diagnostics.push({
            severity: "info",
            code: "IR010_LOSSY_ACTION",
            message: `action in lexer rule ${rule.name} was omitted`,
            loc: token.loc,
          });
        });
    });
  if (files.some((file) => /\bmode\s+[\p{L}_][\p{L}\p{N}_]*\s*;/u.test(file.content))) {
    diagnostics.push({
      severity: "info",
      code: "IR014_LOSSY_LEXER_MODE",
      message: "ANTLR lexer modes were flattened into one terminal namespace",
    });
  }

  const parserRules = rawRules.filter((rule) => !rule.lexer);
  const localRuleNames = new Set(parserRules.map((rule) => rule.name));
  const loweredRules: GrammarIR["rules"] = [];
  parserRules.forEach((rule) => {
    const parser = new ExpressionParser(
      rule.body,
      diagnostics,
      aliases,
      Math.min(options.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH, MAX_SUPPORTED_NESTING_DEPTH),
    );
    const alternatives = parser.alternatives();
    parser.implicitLiterals.forEach((literal) => {
      const terminal: TerminalDecl = { literal };
      terminals.set(terminalKey(terminal), terminal);
    });
    parser.terminalReferences.forEach((name) => {
      if (![...terminals.values()].some((terminal) => terminal.name === name)) {
        terminals.set(`name:${name}`, { name });
      }
    });
    parser.references.forEach((name) => {
      if (!localRuleNames.has(name) && importedGrammarNames.size > 0) {
        externalSymbols.set(name, { name, origin: "import", kind: "rule" });
      }
    });
    loweredRules.push({
      name: rule.name,
      alternatives,
      loc: rule.loc,
    });
  });

  if (diagnostics.some((diagnostic) => diagnostic.code === "ANTLR003_NESTING_TOO_DEEP")) {
    return { ir: null, diagnostics };
  }

  if (loweredRules.length === 0) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "ANTLR401_NO_PARSER_RULES",
      message: "no ANTLR parser rules could be parsed",
    };
    return { ir: null, diagnostics: [...diagnostics, diagnostic] };
  }
  const ir: GrammarIR = {
    irVersion: IR_VERSION,
    source: {
      format: "antlr4",
      dialect: "antlr4",
      fileNames: files.map((file) => file.name),
      frontend: { id: FRONTEND_ANTLR_ID, version: FRONTEND_ANTLR_VERSION },
    },
    capabilities: {
      orderedChoice: false,
      ebnfSugar: loweredRules.some((rule) =>
        rule.alternatives.some((alternative) => alternative.items.some(hasSugar)),
      ),
      predicates: false,
      scannerless: false,
      precedenceTable: false,
      parameterizedRules: false,
      lexerRules: rawRules.some((rule) => rule.lexer),
    },
    startSymbols: loweredRules[0] ? [loweredRules[0].name] : [],
    terminals: [...terminals.values()],
    externalSymbols: [...externalSymbols.values()].sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    ),
    precedence: [],
    rules: mergeRulesByName(loweredRules),
    diagnostics,
  };
  return { ir, diagnostics };
};

export const antlrFrontend: Frontend = {
  id: FRONTEND_ANTLR_ID,
  version: FRONTEND_ANTLR_VERSION,
  detect(fileName, head4k) {
    const extensionScore = /\.g4$/iu.test(fileName) ? 0.65 : 0;
    const signatureScore = /\b(?:parser\s+|lexer\s+)?grammar\s+[\p{L}_][\p{L}\p{N}_]*\s*;/u.test(
      head4k,
    )
      ? 0.35
      : 0;
    return Math.min(1, extensionScore + signatureScore);
  },
  parse,
};
