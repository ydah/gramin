import type { Diagnostic } from "@gramin/core";
import { SourceCursor } from "./source-cursor.js";
import type { LexResult, Token, TokenKind } from "./token.js";

const punctuationKinds: Readonly<Record<string, TokenKind>> = {
  ":": "colon",
  "|": "bar",
  ";": "semicolon",
  ",": "comma",
  "(": "lparen",
  ")": "rparen",
  "[": "lbracket",
  "]": "rbracket",
};

const isIdentifierStart = (character: string): boolean => /[A-Za-z_.$@]/u.test(character);
const isIdentifierPart = (character: string): boolean => /[A-Za-z0-9_.$@-]/u.test(character);
const blockDirectives = new Set([
  "union",
  "code",
  "destructor",
  "printer",
  "initial-action",
  "param",
  "lex-param",
  "parse-param",
]);

export const lexYacc = (source: string): LexResult => {
  const cursor = new SourceCursor(source);
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let sectionCount = 0;
  let declarationBlockExpected = false;

  const pushToken = (kind: TokenKind, value: string, start: ReturnType<typeof cursor.mark>) => {
    tokens.push({ kind, value, loc: cursor.spanFrom(start) });
  };

  const skipQuoted = (quote: string): void => {
    cursor.advance();
    while (!cursor.done) {
      const character = cursor.advance();
      if (character === "\\") {
        cursor.advance();
        continue;
      }
      if (character === quote) return;
    }
  };

  const skipLineComment = (): void => {
    cursor.advanceBy(2);
    while (!cursor.done && cursor.peek() !== "\n") cursor.advance();
  };

  const skipBlockComment = (): void => {
    cursor.advanceBy(2);
    while (!cursor.done && !cursor.startsWith("*/")) cursor.advance();
    if (cursor.startsWith("*/")) cursor.advanceBy(2);
  };

  const skipTrivia = (): void => {
    while (!cursor.done) {
      if (/\s/u.test(cursor.peek())) {
        cursor.advance();
        continue;
      }
      if (cursor.startsWith("//")) {
        skipLineComment();
        continue;
      }
      if (cursor.startsWith("/*")) {
        skipBlockComment();
        continue;
      }
      break;
    }
  };

  const scanLiteral = (): void => {
    const start = cursor.mark();
    const quote = cursor.peek();
    cursor.advance();
    let value = "";
    while (!cursor.done) {
      const character = cursor.advance();
      if (character === "\\") {
        const escaped = cursor.advance();
        value += `\\${escaped}`;
        continue;
      }
      if (character === quote) {
        pushToken("literal", value, start);
        return;
      }
      value += character;
    }
    diagnostics.push({
      severity: "error",
      code: "YACC002_UNCLOSED_LITERAL",
      message: "unterminated string or character literal",
      loc: cursor.spanFrom(start),
    });
    pushToken("literal", value, start);
  };

  const scanAction = (): void => {
    const start = cursor.mark();
    let depth = 0;
    let rawStringSeen = false;
    while (!cursor.done) {
      const looksLikeRecoveredRuleBoundary =
        depth === 1 &&
        cursor.peek() === ";" &&
        /^;\s*\n\s*[A-Za-z_.$@][A-Za-z0-9_.$@-]*\s*:/u.test(cursor.remaining());
      if (looksLikeRecoveredRuleBoundary) {
        diagnostics.push({
          severity: "error",
          code: "YACC001_UNCLOSED_ACTION",
          message: "unterminated action block; recovered at the next rule boundary",
          loc: cursor.spanFrom(start),
        });
        pushToken("action", cursor.slice(start).slice(1), start);
        return;
      }
      if (cursor.startsWith("//")) {
        skipLineComment();
        continue;
      }
      if (cursor.startsWith("/*")) {
        skipBlockComment();
        continue;
      }
      if (cursor.startsWith('R"')) rawStringSeen = true;
      const character = cursor.peek();
      if (character === '"' || character === "'") {
        skipQuoted(character);
        continue;
      }
      cursor.advance();
      if (character === "{") depth += 1;
      if (character !== "}") continue;
      depth -= 1;
      if (depth === 0) {
        const text = cursor.slice(start);
        pushToken("action", text.slice(1, -1), start);
        if (rawStringSeen) {
          diagnostics.push({
            severity: "warning",
            code: "YACC003_SUSPICIOUS_RAW_STRING",
            message: "C++ raw strings may prevent reliable action brace matching",
            loc: cursor.spanFrom(start),
          });
        }
        return;
      }
    }
    diagnostics.push({
      severity: "error",
      code: "YACC001_UNCLOSED_ACTION",
      message: "unterminated action block; parsing may be partial",
      loc: cursor.spanFrom(start),
    });
    pushToken("action", cursor.slice(start).slice(1), start);
  };

  const scanPrologue = (): void => {
    const start = cursor.mark();
    cursor.advanceBy(2);
    while (!cursor.done && !cursor.startsWith("%}")) cursor.advance();
    if (cursor.startsWith("%}")) {
      cursor.advanceBy(2);
      return;
    }
    diagnostics.push({
      severity: "error",
      code: "YACC004_UNCLOSED_PROLOGUE",
      message: "unterminated %{ ... %} prologue",
      loc: cursor.spanFrom(start),
    });
  };

  while (!cursor.done) {
    skipTrivia();
    if (cursor.done) break;

    if (cursor.startsWith("%{")) {
      scanPrologue();
      continue;
    }
    if (cursor.startsWith("%%")) {
      const start = cursor.mark();
      cursor.advanceBy(2);
      pushToken("section", "%%", start);
      sectionCount += 1;
      declarationBlockExpected = false;
      if (sectionCount === 2) break;
      continue;
    }
    if (cursor.peek() === "%") {
      const start = cursor.mark();
      cursor.advance();
      while (isIdentifierPart(cursor.peek())) cursor.advance();
      const directive = cursor.slice(start).slice(1);
      pushToken("directive", directive, start);
      declarationBlockExpected = sectionCount === 0 && blockDirectives.has(directive);
      continue;
    }
    if (cursor.peek() === "{" && (sectionCount > 0 || declarationBlockExpected)) {
      scanAction();
      declarationBlockExpected = false;
      continue;
    }
    if (cursor.peek() === '"' || cursor.peek() === "'") {
      scanLiteral();
      continue;
    }
    if (cursor.peek() === "<") {
      const start = cursor.mark();
      cursor.advance();
      while (!cursor.done && cursor.peek() !== ">") cursor.advance();
      if (cursor.peek() === ">") cursor.advance();
      pushToken("tag", cursor.slice(start).slice(1, -1), start);
      continue;
    }
    if (isIdentifierStart(cursor.peek())) {
      const start = cursor.mark();
      cursor.advance();
      while (isIdentifierPart(cursor.peek())) cursor.advance();
      pushToken("identifier", cursor.slice(start), start);
      continue;
    }

    const start = cursor.mark();
    const character = cursor.advance();
    pushToken(punctuationKinds[character] ?? "other", character, start);
  }

  const end = cursor.mark();
  pushToken("eof", "", end);
  return { tokens, diagnostics };
};
