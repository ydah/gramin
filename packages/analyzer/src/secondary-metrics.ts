import type { GrammarFeatures, GrammarIR } from "@gramin/core";
import { walkExpression } from "./expressions.js";
import { compareBytes, round4 } from "./numbers.js";

export const precedenceFeatures = (ir: GrammarIR): GrammarFeatures["precedence"] => {
  if (!ir.capabilities.precedenceTable) {
    const reason = "precedenceTable capability is false";
    return {
      notApplicable: {
        levels: reason,
        assocBreakdown: reason,
        precOverrides: reason,
        maxTokensPerLevel: reason,
        rulesWithPrecOverrides: reason,
        precOverrideAlternativeRatio: reason,
        tokensInPrecedence: reason,
      },
    };
  }

  const tokens = new Set(ir.precedence.flatMap((level) => level.tokens));
  const coveredTerminals = ir.terminals.filter(
    (terminal) =>
      (terminal.name !== undefined && tokens.has(terminal.name)) ||
      (terminal.literal !== undefined && tokens.has(terminal.literal)),
  ).length;
  const alternatives = ir.rules.flatMap((rule) => rule.alternatives);
  const assocBreakdown = { left: 0, right: 0, nonassoc: 0, precedence: 0 };
  ir.precedence.forEach((level) => {
    assocBreakdown[level.assoc] += 1;
  });
  const precOverrides = ir.rules.reduce(
    (count, rule) =>
      count + rule.alternatives.filter((alternative) => alternative.precedence).length,
    0,
  );
  const rulesWithPrecOverrides = ir.rules.filter((rule) =>
    rule.alternatives.some((alternative) => alternative.precedence !== undefined),
  ).length;
  const notApplicable =
    alternatives.length === 0
      ? { precOverrideAlternativeRatio: "grammar has no alternatives" }
      : undefined;
  return {
    levels: ir.precedence.length,
    assocBreakdown,
    precOverrides,
    maxTokensPerLevel: ir.precedence.reduce(
      (maximum, level) => Math.max(maximum, level.tokens.length),
      0,
    ),
    rulesWithPrecOverrides,
    ...(alternatives.length === 0
      ? {}
      : { precOverrideAlternativeRatio: round4(precOverrides / alternatives.length) }),
    tokensInPrecedence: {
      count: coveredTerminals,
      ratio: round4(ir.terminals.length === 0 ? 0 : coveredTerminals / ir.terminals.length),
    },
    ...(notApplicable === undefined ? {} : { notApplicable }),
  };
};

export const lexiconFeatures = (ir: GrammarIR): GrammarFeatures["lexicon"] => {
  let literalOccurrences = 0;
  let charClassCount = 0;
  let anyCharCount = 0;
  const usage = new Map(
    ir.terminals.map((terminal) => [
      terminal.name === undefined ? `literal:${terminal.literal}` : `name:${terminal.name}`,
      0,
    ]),
  );
  const nameKeys = new Map(
    ir.terminals.flatMap((terminal) =>
      terminal.name === undefined ? [] : [[terminal.name, `name:${terminal.name}`] as const],
    ),
  );
  const literalKeys = new Map(
    ir.terminals.flatMap((terminal) =>
      terminal.literal === undefined
        ? []
        : [
            [
              terminal.literal,
              terminal.name === undefined ? `literal:${terminal.literal}` : `name:${terminal.name}`,
            ] as const,
          ],
    ),
  );
  ir.rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach((item) => {
        walkExpression(item, (expression) => {
          if (expression.kind === "terminal" && expression.literal !== undefined) {
            literalOccurrences += 1;
          }
          if (expression.kind === "terminal") {
            const key =
              (expression.name === undefined ? undefined : nameKeys.get(expression.name)) ??
              (expression.literal === undefined ? undefined : literalKeys.get(expression.literal));
            if (key !== undefined) usage.set(key, (usage.get(key) ?? 0) + 1);
          }
          if (expression.kind === "charClass") charClassCount += 1;
          if (expression.kind === "anyChar") anyCharCount += 1;
        });
      });
    });
  });
  const literals = [
    ...new Set(
      ir.terminals.flatMap((terminal) =>
        terminal.literal === undefined ? [] : [terminal.literal],
      ),
    ),
  ];
  const literalPrefixCollisions = literals
    .flatMap((prefix) =>
      prefix.length === 0
        ? []
        : literals
            .filter((literal) => literal !== prefix && literal.startsWith(prefix))
            .map((literal) => ({ prefix, literal })),
    )
    .sort(
      (left, right) =>
        compareBytes(left.prefix, right.prefix) || compareBytes(left.literal, right.literal),
    );
  const hasIdentifierPattern =
    ir.terminals.some(
      (terminal) =>
        terminal.name !== undefined &&
        /(?:^|_)(?:ID|IDENT|IDENTIFIER|NAME)(?:$|_)/iu.test(terminal.name),
    ) || ir.rules.some((rule) => /identifier|ident|name/iu.test(rule.name));
  const usedEntries = [...usage].filter(([, count]) => count > 0);
  return {
    namedTokens: ir.terminals.filter((terminal) => terminal.name !== undefined).length,
    literalTokens: ir.terminals.filter((terminal) => terminal.name === undefined).length,
    literalOccurrences,
    charClassCount,
    anyCharCount,
    keywordLike: literals.filter((literal) => /^[A-Za-z]+$/u.test(literal)).sort(compareBytes),
    punctuationLike: literals
      .filter((literal) => literal.length > 0 && /^[^A-Za-z0-9]+$/u.test(literal))
      .sort(compareBytes),
    literalPrefixCollisions,
    keywordIdentifierCollisions: hasIdentifierPattern
      ? literals.filter((literal) => /^[A-Za-z]+$/u.test(literal)).sort(compareBytes)
      : [],
    tokenUsage: {
      used: usedEntries.length,
      coverage: round4(ir.terminals.length === 0 ? 0 : usedEntries.length / ir.terminals.length),
      singleUse: usedEntries
        .filter(([, count]) => count === 1)
        .map(([key]) => key.slice(key.indexOf(":") + 1))
        .sort(compareBytes),
    },
    ...(ir.capabilities.scannerless
      ? {
          notApplicable: {
            namedTokens:
              "scannerless grammar: use literalOccurrences, charClassCount, and anyCharCount",
            literalTokens: "scannerless grammar: declarations do not represent a separate lexer",
          },
        }
      : {}),
  };
};

export const sugarFeatures = (ir: GrammarIR): GrammarFeatures["sugar"] => {
  let opt = 0;
  let star = 0;
  let plus = 0;
  let parameterizedCalls = 0;
  const known = new Map<string, number>();
  const standardLibraryNames = new Set(
    ir.externalSymbols
      .filter((symbol) => symbol.origin === "stdlib" && symbol.kind === "rule")
      .map((symbol) => symbol.name),
  );
  ir.rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach((item) => {
        walkExpression(item, (expression) => {
          if (expression.kind === "opt") opt += 1;
          if (expression.kind === "star") star += 1;
          if (expression.kind === "plus") plus += 1;
          if (expression.kind === "symbol" && expression.args !== undefined) {
            parameterizedCalls += 1;
            if (standardLibraryNames.has(expression.name)) {
              known.set(expression.name, (known.get(expression.name) ?? 0) + 1);
            }
          }
        });
      });
    });
  });
  const notApplicable: Record<string, string> = {};
  if (!ir.capabilities.ebnfSugar) {
    notApplicable.opt = "ebnfSugar capability is false";
    notApplicable.star = "ebnfSugar capability is false";
    notApplicable.plus = "ebnfSugar capability is false";
  }
  if (!ir.capabilities.parameterizedRules) {
    notApplicable.parameterizedRuleDefs = "parameterizedRules capability is false";
    notApplicable.parameterizedCalls = "parameterizedRules capability is false";
    notApplicable.inlineRules = "parameterizedRules capability is false";
  }
  return {
    ...(ir.capabilities.ebnfSugar ? { opt, star, plus } : {}),
    ...(ir.capabilities.parameterizedRules
      ? {
          parameterizedRuleDefs: ir.rules.filter((rule) => (rule.params?.length ?? 0) > 0).length,
          parameterizedCalls: {
            total: parameterizedCalls,
            known: Object.fromEntries(
              [...known].sort(([left], [right]) => compareBytes(left, right)),
            ),
          },
          inlineRules: ir.rules.filter((rule) => rule.isInline).length,
        }
      : {}),
    ...(Object.keys(notApplicable).length === 0 ? {} : { notApplicable }),
  };
};

export const actionFeatures = (ir: GrammarIR): GrammarFeatures["actions"] => {
  const alternatives = ir.rules.flatMap((rule) => rule.alternatives);
  const lengths: number[] = [];
  let alternativesWithActions = 0;
  let midRuleActions = 0;
  let rulesWithActions = 0;
  ir.rules.forEach((rule) => {
    let ruleHasAction = false;
    rule.alternatives.forEach((alternative) => {
      if (alternative.action) {
        alternativesWithActions += 1;
        ruleHasAction = true;
        lengths.push(alternative.action.codeLength);
      }
      alternative.items.forEach((item) => {
        walkExpression(item, (expression) => {
          if (expression.kind === "midRuleAction") {
            midRuleActions += 1;
            ruleHasAction = true;
            lengths.push(expression.codeLength);
          }
        });
      });
    });
    if (ruleHasAction) rulesWithActions += 1;
  });
  const totalLength = lengths.reduce((total, length) => total + length, 0);
  const complete = !ir.diagnostics.some((diagnostic) => diagnostic.code === "IR010_LOSSY_ACTION");
  const incompleteReason = "source action metadata was omitted by the frontend";
  return {
    completeness: complete ? "complete" : "partial",
    altActionCoverage: round4(
      alternatives.length === 0 ? 0 : alternativesWithActions / alternatives.length,
    ),
    midRuleActions,
    avgActionLength: round4(lengths.length === 0 ? 0 : totalLength / lengths.length),
    maxActionLength: lengths.reduce((maximum, length) => Math.max(maximum, length), 0),
    ...(complete
      ? {
          trailingActions: alternativesWithActions,
          totalActions: lengths.length,
          rulesWithActions,
        }
      : {
          notApplicable: {
            altActionCoverage: incompleteReason,
            avgActionLength: incompleteReason,
            maxActionLength: incompleteReason,
            midRuleActions: incompleteReason,
            rulesWithActions: incompleteReason,
            totalActions: incompleteReason,
            trailingActions: incompleteReason,
          },
        }),
  };
};
