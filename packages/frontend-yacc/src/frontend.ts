import type {
  Diagnostic,
  Frontend,
  FrontendOptions,
  FrontendResult,
  SourceFile,
} from "@gramin/core";
import { lowerYaccAst } from "./lower.js";
import { parseYaccAst } from "./parser.js";

export const FRONTEND_YACC_VERSION = "0.1.0";
export const FRONTEND_YACC_ID = "yacc-family";

const detect = (fileName: string, head4k: string): number => {
  const extensionScore = /\.(?:y|yy|yacc)$/iu.test(fileName) ? 0.6 : 0;
  const signatureScore = /(?:^|\n)\s*%%(?:\s|$)/u.test(head4k) ? 0.4 : 0;
  return Math.min(1, extensionScore + signatureScore);
};

const parse = (files: readonly SourceFile[], options: FrontendOptions): FrontendResult => {
  const first = files[0];
  if (!first) {
    return {
      ir: null,
      diagnostics: [
        {
          severity: "error",
          code: "YACC400_NO_INPUT",
          message: "the yacc frontend requires at least one source file",
        },
      ],
    };
  }

  const parsed = parseYaccAst(first.content, options.dialect);
  const extraFileDiagnostic: Diagnostic[] =
    files.length > 1
      ? [
          {
            severity: "warning",
            code: "YACC401_EXTRA_FILES_IGNORED",
            message: "the yacc frontend uses only the first input file",
          },
        ]
      : [];
  const ast = {
    ...parsed.ast,
    diagnostics: [...parsed.ast.diagnostics, ...extraFileDiagnostic],
  };
  const ir = lowerYaccAst(ast, {
    fileNames: [first.name],
    frontendId: FRONTEND_YACC_ID,
    frontendVersion: FRONTEND_YACC_VERSION,
  });

  if (ir.rules.length === 0) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "YACC402_NO_RULES",
      message: "no grammar rules could be parsed",
    };
    return { ir: null, diagnostics: [...ir.diagnostics, diagnostic] };
  }
  return { ir, diagnostics: ir.diagnostics };
};

export const yaccFrontend: Frontend = {
  id: FRONTEND_YACC_ID,
  version: FRONTEND_YACC_VERSION,
  detect,
  parse,
};
