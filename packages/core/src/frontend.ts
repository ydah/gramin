import type { Diagnostic, GrammarIR } from "./schemas/ir.js";

export interface SourceFile {
  readonly name: string;
  readonly content: string;
}

export interface FrontendOptions {
  readonly dialect?: string;
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
