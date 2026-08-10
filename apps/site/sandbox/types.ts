import type { Diagnostic, Frontend, GrammarFeatures, GrammarIR, SourceFile } from "@gramin/core";
import type { FeatureDiff } from "@gramin/reporter";

export type SandboxMode = "source" | "ir" | "compare";

export interface AnalyzeRequest {
  readonly mode: SandboxMode;
  readonly files: readonly SourceFile[];
  readonly frontendId: string;
  readonly beforeFiles?: readonly SourceFile[];
  readonly afterFiles?: readonly SourceFile[];
  readonly dialect?: string;
  readonly maxNestingDepth?: number;
  readonly budgetChars: number;
}

export interface SandboxReports {
  readonly json: string;
  readonly markdown: string;
  readonly llm: string;
  readonly sarif: string;
  readonly ir: string;
}

export interface AnalyzeSuccess {
  readonly ok: true;
  readonly frontend: Pick<Frontend, "id" | "version">;
  readonly ir: GrammarIR;
  readonly features: GrammarFeatures;
  readonly reports: SandboxReports;
  readonly comparison?: SandboxComparison;
  readonly elapsedMilliseconds: number;
}

export interface SandboxComparison {
  readonly before: Pick<AnalyzeSuccess, "frontend" | "ir" | "features">;
  readonly after: Pick<AnalyzeSuccess, "frontend" | "ir" | "features">;
  readonly diff: FeatureDiff;
  readonly reports: {
    readonly json: string;
    readonly markdown: string;
  };
}

export interface AnalyzeFailure {
  readonly ok: false;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;

export interface SandboxSample {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly frontendId: string;
  readonly files: readonly SourceFile[];
}
