import type { Frontend } from "@gramin/core";
import { antlrFrontend } from "@gramin/frontend-antlr";
import { bnfFrontend } from "@gramin/frontend-bnf";
import { menhirFrontend } from "@gramin/frontend-menhir";
import { pegFrontend } from "@gramin/frontend-peg";
import { yaccFrontend } from "@gramin/frontend-yacc";

export interface FrontendOption {
  readonly id: string;
  readonly label: string;
  readonly frontend: Frontend;
}

export const frontendOptions: readonly FrontendOption[] = [
  { id: "auto", label: "Auto detect", frontend: yaccFrontend },
  { id: "yacc-family", label: "Yacc / Bison / Lrama", frontend: yaccFrontend },
  { id: "bnf", label: "BNF / EBNF", frontend: bnfFrontend },
  { id: "antlr4", label: "ANTLR4", frontend: antlrFrontend },
  { id: "menhir", label: "Menhir", frontend: menhirFrontend },
  { id: "peggy", label: "Peggy / PEG.js", frontend: pegFrontend },
];

const byId = new Map(frontendOptions.map((option) => [option.id, option.frontend]));

export const getFrontend = (id: string): Frontend | undefined => byId.get(id);

export const detectFrontend = (fileName: string, content: string): Frontend => {
  const candidates = frontendOptions
    .filter((option) => option.id !== "auto")
    .map((option) => ({
      frontend: option.frontend,
      score: option.frontend.detect(fileName, content),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const tied = candidates.filter(({ score }) => score === best?.score);
  if (!best || tied.length !== 1) {
    const ids = tied.map(({ frontend }) => frontend.id).join(", ");
    throw new Error(
      ids ? `frontend detection is ambiguous: ${ids}` : "frontend could not be detected",
    );
  }
  return best.frontend;
};
