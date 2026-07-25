import type { Diagnostic } from "@gramin/core";
import type { Token, TokenKind } from "./token.js";

export class TokenStream {
  readonly diagnostics: Diagnostic[] = [];
  readonly #tokens: readonly Token[];
  #index = 0;

  constructor(tokens: readonly Token[]) {
    this.#tokens = tokens;
  }

  peek(distance = 0): Token {
    const token = this.#tokens[this.#index + distance];
    if (token) return token;
    const fallback = this.#tokens.at(-1);
    if (!fallback) throw new Error("TokenStream requires an EOF token");
    return fallback;
  }

  consume(): Token {
    const token = this.peek();
    if (token.kind !== "eof") this.#index += 1;
    return token;
  }

  match(kind: TokenKind, value?: string): Token | undefined {
    const token = this.peek();
    if (token.kind !== kind || (value !== undefined && token.value !== value)) return undefined;
    return this.consume();
  }

  report(severity: "error" | "warning" | "info", code: string, message: string): void {
    this.diagnostics.push({ severity, code, message, loc: this.peek().loc });
  }
}
