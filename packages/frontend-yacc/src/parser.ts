import type { Diagnostic } from "@gramin/core";
import type { YaccAst } from "./ast.js";
import { parseDeclarations } from "./declarations.js";
import { lexYacc } from "./lexer.js";
import { parseRules } from "./rules.js";
import { TokenStream } from "./token-stream.js";

export const parseYaccAst = (
  source: string,
  dialectHint?: string,
): { readonly ast: YaccAst; readonly diagnostics: readonly Diagnostic[] } => {
  const lexed = lexYacc(source);
  const stream = new TokenStream(lexed.tokens);
  const declarations = parseDeclarations(stream);
  const parsedRules = parseRules(stream, declarations.declaredTypes);
  const lramaSyntaxSeen = declarations.lramaSyntaxSeen || parsedRules.lramaSyntaxSeen;
  const dialect =
    dialectHint === "lrama" || (!dialectHint && lramaSyntaxSeen)
      ? "lrama"
      : dialectHint === "bison"
        ? "bison"
        : "yacc";
  const diagnostics = [...lexed.diagnostics, ...stream.diagnostics];

  return {
    ast: {
      dialect,
      startSymbols:
        declarations.startSymbols.length > 0
          ? declarations.startSymbols
          : parsedRules.rules[0]
            ? [parsedRules.rules[0].name]
            : [],
      terminals: declarations.terminals,
      precedence: declarations.precedence,
      rules: [...declarations.preambleRules, ...parsedRules.rules],
      diagnostics,
    },
    diagnostics,
  };
};
