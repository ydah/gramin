import type { Diagnostic, GrammarIR } from "./schemas/ir.js";

export const DEFAULT_MAX_NESTING_DEPTH = 500;
export const MAX_SUPPORTED_NESTING_DEPTH = 1_000;

export interface SourceFile {
  readonly name: string;
  readonly content: string;
}

export interface FrontendOptions {
  readonly dialect?: string;
  readonly maxNestingDepth?: number;
}

export interface FrontendResult {
  readonly ir: GrammarIR | null;
  readonly diagnostics: Diagnostic[];
}

export interface Frontend {
  readonly id: string;
  readonly version: string;
  detect(fileName: string, head4k: string): number;
  parse(files: readonly SourceFile[], options: FrontendOptions): FrontendResult;
}
