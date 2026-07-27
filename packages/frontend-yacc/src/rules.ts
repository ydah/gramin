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

const parsePostfix = (stream: TokenStream, item: YaccItem): YaccItem => {
  const postfix = stream.peek();
  if (postfix.kind !== "other" || !["?", "*", "+"].includes(postfix.value)) return item;
  stream.consume();
  const operator = postfix.value === "?" ? "opt" : postfix.value === "*" ? "star" : "plus";
  return { kind: "repeat", operator, item, loc: item.loc };
};

const parseItem = (stream: TokenStream): YaccItem | undefined => {
  const token = stream.peek();
  if (token.kind === "identifier") {
    stream.consume();
    const args = parseArguments(stream);
    const label = parseLabel(stream);
    return parsePostfix(stream, {
      kind: "reference",
      name: token.value,
      ...(args === undefined ? {} : { args }),
      ...(label === undefined ? {} : { label }),
      loc: token.loc,
    });
  }
  if (token.kind === "literal") {
    stream.consume();
    const label = parseLabel(stream);
    if (label !== undefined) {
      stream.diagnostics.push({
        severity: "info",
        code: "IR012_LOSSY_TERMINAL_LABEL",
        message: `terminal label ${label} is not represented in Grammar IR v0.2`,
        loc: token.loc,
      });
    }
    return parsePostfix(stream, { kind: "literal", value: token.value, loc: token.loc });
  }
  if (token.kind === "action") {
    stream.consume();
    const label = parseLabel(stream);
    const declaredType = stream.match("tag");
    if (label !== undefined || declaredType !== undefined) {
      stream.diagnostics.push({
        severity: "info",
        code: "IR013_LOSSY_ACTION_METADATA",
        message: "mid-rule action label and semantic type are not represented in Grammar IR v0.2",
        loc: token.loc,
      });
    }
    return { kind: "action", codeLength: token.value.length, loc: token.loc };
  }
  return undefined;
};

const isRuleDefinitionStart = (stream: TokenStream): boolean => {
  let distance = 0;
  while (
    stream.peek(distance).kind === "directive" &&
    ["inline", "rule"].includes(stream.peek(distance).value)
  ) {
    distance += 1;
  }
  if (stream.peek(distance).kind !== "identifier") return false;
  distance += 1;

  if (stream.peek(distance).kind === "lparen") {
    do {
      distance += 1;
    } while (!["eof", "rparen"].includes(stream.peek(distance).kind));
    if (stream.peek(distance).kind !== "rparen") return false;
    distance += 1;
  }

  if (stream.peek(distance).kind === "lbracket") {
    distance += 1;
    if (stream.peek(distance).kind !== "identifier") return false;
    distance += 1;
    if (stream.peek(distance).kind !== "rbracket") return false;
    distance += 1;
  }

  if (stream.peek(distance).kind === "tag") distance += 1;
  return stream.peek(distance).kind === "colon";
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

  while (
    !["bar", "semicolon", "section", "eof"].includes(stream.peek().kind) &&
    !isRuleDefinitionStart(stream)
  ) {
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
  while (
    !["semicolon", "section", "eof"].includes(stream.peek().kind) &&
    !isRuleDefinitionStart(stream)
  ) {
    stream.consume();
  }
  stream.match("semicolon");
};

interface RuleDefinitionResult {
  readonly rule?: YaccRule;
  readonly lramaSyntaxSeen: boolean;
}

export const parseRuleDefinition = (
  stream: TokenStream,
  declaredTypes: ReadonlyMap<string, string>,
): RuleDefinitionResult => {
  let isInline = false;
  let lramaSyntaxSeen = false;
  while (stream.peek().kind === "directive") {
    if (stream.peek().value === "rule") {
      stream.consume();
      lramaSyntaxSeen = true;
      continue;
    }
    if (stream.peek().value === "inline") {
      stream.consume();
      isInline = true;
      lramaSyntaxSeen = true;
      continue;
    }
    break;
  }

  const name = stream.match("identifier");
  if (!name) {
    stream.report("warning", "YACC200_EXPECTED_RULE", "expected a rule name");
    stream.consume();
    return { lramaSyntaxSeen };
  }
  const params = parseParameters(stream);
  if (params) lramaSyntaxSeen = true;
  const labelStart = stream.peek();
  const label = parseLabel(stream);
  if (label !== undefined) {
    stream.diagnostics.push({
      severity: "info",
      code: "IR014_LOSSY_RULE_LABEL",
      message: `rule label ${label} is not represented in Grammar IR v0.2`,
      loc: labelStart.loc,
    });
  }
  const inlineType = stream.match("tag")?.value;
  if (!stream.match("colon")) {
    stream.report("error", "YACC208_EXPECTED_COLON", `expected : after rule ${name.value}`);
    recoverRule(stream);
    return { lramaSyntaxSeen };
  }

  const alternatives: YaccAlternative[] = [];
  do {
    alternatives.push(parseAlternative(stream, name));
  } while (stream.match("bar"));

  if (
    !stream.match("semicolon") &&
    !isRuleDefinitionStart(stream) &&
    !["eof", "section"].includes(stream.peek().kind)
  ) {
    stream.report("error", "YACC209_EXPECTED_SEMICOLON", `expected ; after rule ${name.value}`);
    recoverRule(stream);
  }
  const declaredType = inlineType ?? declaredTypes.get(name.value);
  return {
    rule: {
      name: name.value,
      ...(params === undefined ? {} : { params }),
      ...(isInline ? { isInline: true } : {}),
      ...(declaredType === undefined ? {} : { declaredType }),
      alternatives,
      loc: name.loc,
    },
    lramaSyntaxSeen,
  };
};

export const parseRules = (
  stream: TokenStream,
  declaredTypes: ReadonlyMap<string, string>,
): RuleParseResult => {
  const rules: YaccRule[] = [];
  let lramaSyntaxSeen = false;

  while (!["section", "eof"].includes(stream.peek().kind)) {
    const directive = stream.peek();
    if (
      directive.kind === "directive" &&
      directive.value !== "rule" &&
      directive.value !== "inline"
    ) {
      stream.consume();
      stream.diagnostics.push({
        severity: "warning",
        code: "YACC201_UNEXPECTED_DIRECTIVE",
        message: `unexpected %${directive.value} between rules`,
        loc: directive.loc,
      });
      continue;
    }
    const parsed = parseRuleDefinition(stream, declaredTypes);
    if (parsed.rule) rules.push(parsed.rule);
    if (parsed.lramaSyntaxSeen) lramaSyntaxSeen = true;
  }

  stream.match("section");
  return { rules, lramaSyntaxSeen };
};
