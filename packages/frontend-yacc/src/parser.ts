import {
  DEFAULT_MAX_NESTING_DEPTH,
  MAX_SUPPORTED_NESTING_DEPTH,
  type Diagnostic,
  type SourceSpan,
} from "@gramin/core";
import type { YaccAst } from "./ast.js";
import { parseDeclarations } from "./declarations.js";
import { lexYacc } from "./lexer.js";
import { parseRules } from "./rules.js";
import { TokenStream } from "./token-stream.js";

export const parseYaccAst = (
  source: string,
  dialectHint?: string,
  options: { readonly maxNestingDepth?: number } = {},
): { readonly ast: YaccAst; readonly diagnostics: readonly Diagnostic[] } => {
  const lexed = lexYacc(source);
  const maximum = Math.min(
    options.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH,
    MAX_SUPPORTED_NESTING_DEPTH,
  );
  let nestingDepth = 0;
  let excessiveNestingLoc: SourceSpan | undefined;
  for (const token of lexed.tokens) {
    if (token.kind === "lparen") {
      if (nestingDepth >= maximum) {
        excessiveNestingLoc = token.loc;
        break;
      }
      nestingDepth += 1;
    } else if (token.kind === "rparen") {
      nestingDepth = Math.max(0, nestingDepth - 1);
    }
  }
  if (excessiveNestingLoc) {
    const diagnostics = [
      ...lexed.diagnostics,
      {
        severity: "error" as const,
        code: "YACC005_NESTING_TOO_DEEP",
        message: `maximum nesting depth ${maximum} exceeded`,
        loc: excessiveNestingLoc,
      },
    ];
    return {
      ast: {
        dialect: dialectHint === "lrama" ? "lrama" : dialectHint === "bison" ? "bison" : "yacc",
        startSymbols: [],
        terminals: [],
        precedence: [],
        rules: [],
        diagnostics,
      },
      diagnostics,
    };
  }
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
