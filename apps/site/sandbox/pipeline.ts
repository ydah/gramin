import { analyzeGrammar } from "@gramin/analyzer";
import {
  canonicalize,
  type Diagnostic,
  type Frontend,
  type GrammarIR,
  type SourceFile,
  serializeCanonical,
  validateIR,
} from "@gramin/core";
import {
  diffFeatures,
  renderFeatureDiffJson,
  renderFeatureDiffMarkdown,
  renderJson,
  renderLlmDigest,
  renderMarkdown,
  renderSarif,
} from "@gramin/reporter";
import { detectFrontend, getFrontend } from "./frontend-registry";
import { MAX_BROWSER_INPUT_CHARS } from "./limits";
import type { AnalyzeRequest, AnalyzeResponse, SandboxComparison, SandboxReports } from "./types";

export { MAX_BROWSER_INPUT_CHARS } from "./limits";

const diagnosticsFromIssues = (
  issues: readonly { code: string; message: string }[],
): Diagnostic[] =>
  issues.map((issue) => ({ severity: "error", code: issue.code, message: issue.message }));

const parseIrInput = (file: SourceFile): AnalyzeResponse | GrammarIR => {
  let input: unknown;
  try {
    input = JSON.parse(file.content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    return { ok: false, message: `Grammar IR JSON is invalid: ${message}`, diagnostics: [] };
  }
  const validation = validateIR(input);
  if (!validation.ok) {
    return {
      ok: false,
      message: "Grammar IR validation failed.",
      diagnostics: diagnosticsFromIssues(validation.issues),
    };
  }
  return validation.value;
};

const selectFrontend = (request: AnalyzeRequest, files: readonly SourceFile[]): Frontend => {
  if (request.frontendId !== "auto") {
    const frontend = getFrontend(request.frontendId);
    if (!frontend) throw new Error(`unknown frontend: ${request.frontendId}`);
    return frontend;
  }
  const firstFile = files[0];
  if (!firstFile) throw new Error("at least one source file is required");
  return detectFrontend(firstFile.name, firstFile.content.slice(0, 4096));
};

const parseSource = (
  request: AnalyzeRequest,
  files: readonly SourceFile[],
): { frontend: Frontend; ir: GrammarIR } | AnalyzeResponse => {
  const frontend = selectFrontend(request, files);
  const result = frontend.parse(files, {
    ...(request.dialect === undefined ? {} : { dialect: request.dialect }),
    ...(request.maxNestingDepth === undefined ? {} : { maxNestingDepth: request.maxNestingDepth }),
  });
  if (!result.ir) {
    return {
      ok: false,
      message: "The frontend could not produce a Grammar IR.",
      diagnostics: result.diagnostics,
    };
  }
  return { frontend, ir: result.ir };
};

const analyzeFiles = (
  request: AnalyzeRequest,
  files: readonly SourceFile[],
):
  | { frontend: Frontend; ir: GrammarIR; features: ReturnType<typeof analyzeGrammar> }
  | AnalyzeResponse => {
  const parsed =
    request.mode === "ir"
      ? parseIrInput(files[0] ?? { name: "input.json", content: "" })
      : parseSource(request, files);
  if ("ok" in parsed && !parsed.ok) return parsed;
  const ir = "ir" in parsed ? parsed.ir : parsed;
  const frontend =
    "frontend" in parsed ? getFrontend(parsed.frontend.id) : getFrontend(ir.source.frontend.id);
  if (!frontend) throw new Error(`no browser frontend registered for ${ir.source.frontend.id}`);
  return { frontend, ir, features: analyzeGrammar(ir) };
};

const reportsFor = (
  ir: GrammarIR,
  features: ReturnType<typeof analyzeGrammar>,
  budgetChars: number,
): SandboxReports => ({
  ir: serializeCanonical(canonicalize(ir)),
  json: renderJson(features),
  markdown: renderMarkdown(features),
  llm: renderLlmDigest(features, { budgetChars }),
  sarif: renderSarif(features),
});

export const analyzeRequest = (request: AnalyzeRequest): AnalyzeResponse => {
  const started = performance.now();
  try {
    const inputFiles = [
      ...request.files,
      ...(request.beforeFiles ?? []),
      ...(request.afterFiles ?? []),
    ];
    const inputSize = inputFiles.reduce((total, file) => total + file.content.length, 0);
    if (inputSize > MAX_BROWSER_INPUT_CHARS) {
      throw new Error(
        `browser sandbox input is limited to ${MAX_BROWSER_INPUT_CHARS.toLocaleString()} characters`,
      );
    }
    if (request.mode === "compare") {
      const before = analyzeFiles(request, request.beforeFiles ?? []);
      if ("ok" in before && !before.ok) return before;
      const after = analyzeFiles(request, request.afterFiles ?? []);
      if ("ok" in after && !after.ok) return after;
      if (before.frontend.id !== after.frontend.id) {
        throw new Error(
          `comparison requires the same frontend: ${before.frontend.id} and ${after.frontend.id}`,
        );
      }
      const diff = diffFeatures(before.features, after.features);
      const comparison: SandboxComparison = {
        before,
        after,
        diff,
        reports: {
          json: renderFeatureDiffJson(diff),
          markdown: renderFeatureDiffMarkdown(diff),
        },
      };
      return {
        ok: true,
        frontend: { id: after.frontend.id, version: after.frontend.version },
        ir: after.ir,
        features: after.features,
        reports: reportsFor(after.ir, after.features, request.budgetChars),
        comparison,
        elapsedMilliseconds: Math.round(performance.now() - started),
      };
    }

    const parsed = analyzeFiles(request, request.files);
    if ("ok" in parsed && !parsed.ok) return parsed;
    const { frontend, ir, features } = parsed;
    return {
      ok: true,
      frontend: { id: frontend.id, version: frontend.version },
      ir,
      features,
      reports: reportsFor(ir, features, request.budgetChars),
      elapsedMilliseconds: Math.round(performance.now() - started),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message, diagnostics: [] };
  }
};
