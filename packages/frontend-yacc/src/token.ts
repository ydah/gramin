import type { Diagnostic, SourceSpan } from "@gramin/core";

export const TOKEN_KINDS = [
  "identifier",
  "literal",
  "tag",
  "directive",
  "section",
  "colon",
  "bar",
  "semicolon",
  "comma",
  "lparen",
  "rparen",
  "lbracket",
  "rbracket",
  "action",
  "other",
  "eof",
] as const;

export type TokenKind = (typeof TOKEN_KINDS)[number];

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly loc: SourceSpan;
}

export interface LexResult {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
}
