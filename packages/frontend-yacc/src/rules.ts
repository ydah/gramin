import type { SourceSpan } from "@gramin/core";
import type { YaccAlternative, YaccItem, YaccRule } from "./ast.js";
import type { Token } from "./token.js";
import type { TokenStream } from "./token-stream.js";

interface RuleParseResult {
  readonly rules: YaccRule[];
  readonly lramaSyntaxSeen: boolean;
}

const parseLabel = (stream: TokenStream): string | undefined => {
  if (!stream.match("lbracket")) return undefined;
  const label = stream.match("identifier")?.value;
  if (!stream.match("rbracket")) {
    stream.report("warning", "YACC202_UNCLOSED_LABEL", "expected ] after named reference");
  }
  return label;
};

const parseArguments = (stream: TokenStream): YaccItem[] | undefined => {
  if (!stream.match("lparen")) return undefined;
  const parsedArguments: YaccItem[] = [];
  while (!["rparen", "eof"].includes(stream.peek().kind)) {
    const argument = parseItem(stream);
    if (argument) parsedArguments.push(argument);
    else stream.consume();
    if (!stream.match("comma") && stream.peek().kind !== "rparen") {
      stream.report("warning", "YACC203_EXPECTED_COMMA", "expected , between rule arguments");
    }
  }
  if (!stream.match("rparen")) {
    stream.report("error", "YACC204_UNCLOSED_ARGUMENTS", "expected ) after rule arguments");
  }
  return parsedArguments;
};

const parseItem = (stream: TokenStream): YaccItem | undefined => {
  const token = stream.peek();
  if (token.kind === "identifier") {
    stream.consume();
    const args = parseArguments(stream);
    const label = parseLabel(stream);
    return {
      kind: "reference",
      name: token.value,
      ...(args === undefined ? {} : { args }),
      ...(label === undefined ? {} : { label }),
      loc: token.loc,
    };
  }
  if (token.kind === "literal") {
    stream.consume();
    return { kind: "literal", value: token.value, loc: token.loc };
  }
  if (token.kind === "action") {
    stream.consume();
    return { kind: "action", codeLength: token.value.length, loc: token.loc };
  }
  return undefined;
};

const alternativeSpan = (first: Token, last: Token): SourceSpan => ({
  startLine: first.loc.startLine,
  startCol: first.loc.startCol,
  endLine: last.loc.endLine,
  endCol: last.loc.endCol,
});

const parseAlternative = (stream: TokenStream, fallback: Token): YaccAlternative => {
  const first = stream.peek();
  const items: YaccItem[] = [];
  let precedence: string | undefined;
  let last = fallback;

  while (!["bar", "semicolon", "section", "eof"].includes(stream.peek().kind)) {
    const item = parseItem(stream);
    if (item) {
      items.push(item);
      last = stream.peek(-1);
      continue;
    }

    const directive = stream.match("directive");
    if (directive?.value === "empty") {
      last = directive;
      continue;
    }
    if (directive?.value === "prec") {
      const target = stream.peek();
      if (target.kind === "identifier" || target.kind === "literal") {
        precedence = stream.consume().value;
        last = target;
      } else {
        stream.report("error", "YACC205_MISSING_PREC", "expected a token after %prec");
      }
      continue;
    }
    if (directive) {
      stream.diagnostics.push({
        severity: "warning",
        code: "YACC206_UNKNOWN_RULE_DIRECTIVE",
        message: `ignored rule directive %${directive.value}`,
        loc: directive.loc,
      });
      continue;
    }

    stream.report(
      "warning",
      "YACC207_UNEXPECTED_RULE_TOKEN",
      `ignored unexpected token ${stream.peek().value}`,
    );
    last = stream.consume();
  }

  return {
    items,
    ...(precedence === undefined ? {} : { precedence }),
    loc: alternativeSpan(first.kind === "eof" ? fallback : first, last),
  };
};

const parseParameters = (stream: TokenStream): string[] | undefined => {
  if (!stream.match("lparen")) return undefined;
  const parameters: string[] = [];
  while (!["rparen", "eof"].includes(stream.peek().kind)) {
    const parameter = stream.match("identifier");
    if (parameter) parameters.push(parameter.value);
    else stream.consume();
    stream.match("comma");
  }
  stream.match("rparen");
  return parameters;
};

const recoverRule = (stream: TokenStream): void => {
  while (!["semicolon", "section", "eof"].includes(stream.peek().kind)) stream.consume();
  stream.match("semicolon");
};

export const parseRules = (
  stream: TokenStream,
  declaredTypes: ReadonlyMap<string, string>,
): RuleParseResult => {
  const rules: YaccRule[] = [];
  let pendingInline = false;
  let lramaSyntaxSeen = false;

  while (!["section", "eof"].includes(stream.peek().kind)) {
    const directive = stream.match("directive");
    if (directive?.value === "inline") {
      pendingInline = true;
      lramaSyntaxSeen = true;
      continue;
    }
    if (directive?.value === "rule") {
      lramaSyntaxSeen = true;
    } else if (directive) {
      stream.diagnostics.push({
        severity: "warning",
        code: "YACC201_UNEXPECTED_DIRECTIVE",
        message: `unexpected %${directive.value} between rules`,
        loc: directive.loc,
      });
      continue;
    }

    const name = stream.match("identifier");
    if (!name) {
      stream.report("warning", "YACC200_EXPECTED_RULE", "expected a rule name");
      stream.consume();
      continue;
    }
    const params = parseParameters(stream);
    if (params) lramaSyntaxSeen = true;
    if (!stream.match("colon")) {
      stream.report("error", "YACC208_EXPECTED_COLON", `expected : after rule ${name.value}`);
      recoverRule(stream);
      pendingInline = false;
      continue;
    }

    const alternatives: YaccAlternative[] = [];
    do {
      alternatives.push(parseAlternative(stream, name));
    } while (stream.match("bar"));

    if (!stream.match("semicolon")) {
      stream.report("error", "YACC209_EXPECTED_SEMICOLON", `expected ; after rule ${name.value}`);
      recoverRule(stream);
    }

    const declaredType = declaredTypes.get(name.value);
    rules.push({
      name: name.value,
      ...(params === undefined ? {} : { params }),
      ...(pendingInline ? { isInline: true } : {}),
      ...(declaredType === undefined ? {} : { declaredType }),
      alternatives,
      loc: name.loc,
    });
    pendingInline = false;
  }

  stream.match("section");
  return { rules, lramaSyntaxSeen };
};
