import type { Diagnostic, SourceSpan } from "@gramin/core";

export interface YaccTerminal {
  readonly name?: string;
  readonly literal?: string;
  readonly declaredType?: string;
  readonly loc: SourceSpan;
}

export type YaccItem =
  | {
      readonly kind: "reference";
      readonly name: string;
      readonly args?: readonly YaccItem[];
      readonly label?: string;
      readonly loc: SourceSpan;
    }
  | { readonly kind: "literal"; readonly value: string; readonly loc: SourceSpan }
  | {
      readonly kind: "repeat";
      readonly operator: "opt" | "star" | "plus";
      readonly item: YaccItem;
      readonly loc: SourceSpan;
    }
  | { readonly kind: "action"; readonly codeLength: number; readonly loc: SourceSpan };

export interface YaccAlternative {
  readonly items: readonly YaccItem[];
  readonly precedence?: string;
  readonly loc: SourceSpan;
}

export interface YaccRule {
  readonly name: string;
  readonly params?: readonly string[];
  readonly isInline?: boolean;
  readonly declaredType?: string;
  readonly alternatives: readonly YaccAlternative[];
  readonly loc: SourceSpan;
}

export interface YaccAst {
  readonly dialect: "yacc" | "bison" | "lrama";
  readonly startSymbols: readonly string[];
  readonly terminals: readonly YaccTerminal[];
  readonly precedence: readonly {
    readonly assoc: "left" | "right" | "nonassoc" | "precedence";
    readonly tokens: readonly {
      readonly value: string;
      readonly literal: boolean;
    }[];
    readonly loc: SourceSpan;
  }[];
  readonly rules: readonly YaccRule[];
  readonly diagnostics: readonly Diagnostic[];
}
