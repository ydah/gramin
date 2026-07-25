import type { YaccAst, YaccTerminal } from "./ast.js";
import type { Token } from "./token.js";
import type { TokenStream } from "./token-stream.js";

export interface DeclarationResult {
  readonly terminals: YaccTerminal[];
  readonly precedence: YaccAst["precedence"][number][];
  readonly startSymbols: string[];
  readonly declaredTypes: ReadonlyMap<string, string>;
  readonly lramaSyntaxSeen: boolean;
}

const ignoredDirectives = new Set([
  "code",
  "debug",
  "define",
  "destructor",
  "expect",
  "expect-rr",
  "initial-action",
  "language",
  "lex-param",
  "locations",
  "param",
  "parse-param",
  "printer",
  "require",
  "skeleton",
  "union",
  "verbose",
]);

const collectDeclarationTokens = (stream: TokenStream): Token[] => {
  const tokens: Token[] = [];
  while (!["directive", "section", "eof"].includes(stream.peek().kind)) {
    tokens.push(stream.consume());
  }
  return tokens;
};

const parseTerminals = (tokens: readonly Token[], terminals: YaccTerminal[]): void => {
  let declaredType: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (token.kind === "tag") {
      declaredType = token.value;
      continue;
    }
    if (token.kind === "identifier") {
      const next = tokens[index + 1];
      if (next?.kind === "literal") {
        terminals.push({
          name: token.value,
          literal: next.value,
          ...(declaredType === undefined ? {} : { declaredType }),
          loc: token.loc,
        });
        index += 1;
      } else {
        terminals.push({
          name: token.value,
          ...(declaredType === undefined ? {} : { declaredType }),
          loc: token.loc,
        });
      }
      continue;
    }
    if (token.kind === "literal") {
      terminals.push({
        literal: token.value,
        ...(declaredType === undefined ? {} : { declaredType }),
        loc: token.loc,
      });
    }
  }
};

const parsePrecedenceTokens = (tokens: readonly Token[]): YaccAst["precedence"][number]["tokens"] =>
  tokens
    .filter((token) => token.kind === "identifier" || token.kind === "literal")
    .map((token) => ({ value: token.value, literal: token.kind === "literal" }));

export const parseDeclarations = (stream: TokenStream): DeclarationResult => {
  const terminals: YaccTerminal[] = [];
  const precedence: YaccAst["precedence"][number][] = [];
  const startSymbols: string[] = [];
  const declaredTypes = new Map<string, string>();
  let lramaSyntaxSeen = false;

  while (stream.peek().kind !== "section" && stream.peek().kind !== "eof") {
    const directive = stream.match("directive");
    if (!directive) {
      stream.consume();
      continue;
    }
    const tokens = collectDeclarationTokens(stream);

    if (directive.value === "token" || directive.value === "nterm") {
      parseTerminals(tokens, terminals);
      continue;
    }
    if (["left", "right", "nonassoc", "precedence"].includes(directive.value)) {
      const assoc = directive.value as "left" | "right" | "nonassoc" | "precedence";
      precedence.push({ assoc, tokens: parsePrecedenceTokens(tokens), loc: directive.loc });
      continue;
    }
    if (directive.value === "start") {
      startSymbols.push(
        ...tokens.filter((token) => token.kind === "identifier").map((token) => token.value),
      );
      continue;
    }
    if (directive.value === "type") {
      const declaredType = tokens.find((token) => token.kind === "tag")?.value;
      if (declaredType) {
        for (const token of tokens) {
          if (token.kind === "identifier") declaredTypes.set(token.value, declaredType);
        }
      }
      continue;
    }
    if (directive.value === "rule" || directive.value === "inline") lramaSyntaxSeen = true;
    if (ignoredDirectives.has(directive.value)) {
      stream.diagnostics.push({
        severity: "info",
        code: "YACC100_IGNORED_DIRECTIVE",
        message: `ignored declaration directive %${directive.value}`,
        loc: directive.loc,
      });
      continue;
    }
    stream.diagnostics.push({
      severity: "warning",
      code: "YACC101_UNKNOWN_DIRECTIVE",
      message: `unknown declaration directive %${directive.value}`,
      loc: directive.loc,
    });
  }

  if (!stream.match("section")) {
    stream.report("error", "YACC102_MISSING_SECTION", "missing first %% grammar section");
  }
  return {
    terminals,
    precedence,
    startSymbols,
    declaredTypes,
    lramaSyntaxSeen,
  };
};
