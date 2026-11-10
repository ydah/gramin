import { compareBytes, type Expr, type GrammarIR, type Rule } from "@gramin/core";

export const PARAMETER_EXPANSION_LIMITS = {
  maxInstances: 10_000,
  maxNodeVisits: 1_000_000,
  maxDepth: 256,
  maxKeyBytes: 8 * 1024 * 1024,
} as const;

export interface ParameterExpansionOptions {
  readonly definitions?: readonly Rule[];
  readonly maxInstances?: number;
  /** Maximum indexing, rule, binder, alternative, and expression work visits. */
  readonly maxNodeVisits?: number;
  readonly maxDepth?: number;
  readonly maxKeyBytes?: number;
}

export type ParameterExpansionResult =
  | {
      readonly ok: true;
      readonly ir: GrammarIR;
      readonly instanceCount: number;
      readonly helperCount: number;
      readonly nodeVisits: number;
      readonly keyBytes: number;
      readonly sourceRuleNames: readonly string[];
      readonly omittedTemplateNames: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

class ExpansionFailure extends Error {}

type IdentityValue = string | boolean | null | readonly IdentityValue[];

interface Definition {
  readonly rule: Rule;
  readonly local: boolean;
}

interface ExpansionJob {
  readonly definition: Definition;
  readonly name: string;
  readonly identity: string;
  readonly environment: ReadonlyMap<string, Expr>;
}

export const expandParameterizedRules = (
  ir: GrammarIR,
  options: ParameterExpansionOptions = {},
): ParameterExpansionResult => {
  const limits = {
    maxInstances: options.maxInstances ?? PARAMETER_EXPANSION_LIMITS.maxInstances,
    maxNodeVisits: options.maxNodeVisits ?? PARAMETER_EXPANSION_LIMITS.maxNodeVisits,
    maxDepth: options.maxDepth ?? PARAMETER_EXPANSION_LIMITS.maxDepth,
    maxKeyBytes: options.maxKeyBytes ?? PARAMETER_EXPANSION_LIMITS.maxKeyBytes,
  };
  let instanceCount = 0;
  let helperCount = 0;
  let nodeVisits = 0;
  let keyBytes = 0;
  let scannerless = false;
  const fail = (reason: string): never => {
    throw new ExpansionFailure(reason);
  };
  const visit = (depth: number, owner: string): void => {
    if (depth > limits.maxDepth) {
      fail(
        `parameter-expansion-limit: ${JSON.stringify(owner)} exceeds maxDepth=${limits.maxDepth}`,
      );
    }
    if (nodeVisits >= limits.maxNodeVisits) {
      fail(
        `parameter-expansion-limit: ${JSON.stringify(owner)} exceeds maxNodeVisits=${limits.maxNodeVisits}`,
      );
    }
    nodeVisits += 1;
  };
  const reserve = (owner: string): void => {
    if (instanceCount + helperCount >= limits.maxInstances) {
      fail(
        `parameter-expansion-limit: ${JSON.stringify(owner)} exceeds maxInstances=${limits.maxInstances} generated rules`,
      );
    }
  };
  const chargeKeyBytes = (count: number, owner: string): void => {
    if (count > limits.maxKeyBytes - keyBytes) {
      fail(
        `parameter-expansion-limit: ${JSON.stringify(owner)} exceeds maxKeyBytes=${limits.maxKeyBytes}`,
      );
    }
    keyBytes += count;
  };
  const chargeIdentity = (value: IdentityValue, owner: string): void => {
    if (typeof value === "string") {
      chargeKeyBytes(2, owner);
      for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (
          code === 0x22 ||
          code === 0x5c ||
          code === 8 ||
          code === 9 ||
          code === 10 ||
          code === 12 ||
          code === 13
        ) {
          chargeKeyBytes(2, owner);
        } else if (code < 0x20) chargeKeyBytes(6, owner);
        else if (code < 0x80) chargeKeyBytes(1, owner);
        else if (code < 0x800) chargeKeyBytes(2, owner);
        else if (
          code >= 0xd800 &&
          code <= 0xdbff &&
          value.charCodeAt(index + 1) >= 0xdc00 &&
          value.charCodeAt(index + 1) <= 0xdfff
        ) {
          chargeKeyBytes(4, owner);
          index += 1;
        } else chargeKeyBytes(code >= 0xd800 && code <= 0xdfff ? 6 : 3, owner);
      }
      return;
    }
    if (value === null || typeof value === "boolean") {
      chargeKeyBytes(value === false ? 5 : 4, owner);
      return;
    }
    chargeKeyBytes(2 + Math.max(0, value.length - 1), owner);
    for (const item of value) chargeIdentity(item, owner);
  };
  const identityKey = (value: IdentityValue, owner: string): string => {
    chargeIdentity(value, owner);
    return JSON.stringify(value);
  };

  try {
    for (const [name, value] of Object.entries(limits)) {
      if (!Number.isSafeInteger(value) || value < 0) {
        fail(`parameter-expansion-limit: invalid ${name}=${value}`);
      }
    }
    const definitions = new Map<string, Definition>();
    const localNames = new Set<string>();
    const declarations: Definition[] = [];
    for (const rule of ir.rules) {
      visit(0, rule.name);
      localNames.add(rule.name);
      declarations.push({ rule, local: true });
    }
    for (const rule of options.definitions ?? []) {
      visit(0, rule.name);
      if (!localNames.has(rule.name)) declarations.push({ rule, local: false });
    }
    declarations.sort((left, right) => compareBytes(left.rule.name, right.rule.name));
    for (const definition of declarations) {
      const { rule } = definition;
      const params = rule.params ?? [];
      for (const _param of params) visit(0, rule.name);
      for (const _alternative of rule.alternatives) visit(0, rule.name);
      if (new Set(params).size !== params.length) {
        fail(`parameter-binding-unsupported: duplicate formal in ${JSON.stringify(rule.name)}`);
      }
      const previous = definitions.get(rule.name);
      if (previous) {
        const previousParams = previous.rule.params ?? [];
        if (
          previousParams.length !== params.length ||
          params.some((param, index) => param !== previousParams[index])
        ) {
          fail(
            `parameter-binding-unsupported: incompatible declarations for ${JSON.stringify(rule.name)}`,
          );
        }
        for (const alternative of rule.alternatives) previous.rule.alternatives.push(alternative);
        if (rule.orderedAlternatives) previous.rule.orderedAlternatives = true;
      } else
        definitions.set(rule.name, {
          ...definition,
          rule: { ...rule, alternatives: [...rule.alternatives] },
        });
    }

    const sourceRuleNames = [...definitions.values()]
      .filter(({ local, rule }) => local && (rule.params?.length ?? 0) === 0)
      .map(({ rule }) => rule.name);
    const omittedTemplateNames = [...definitions.values()]
      .filter(({ local, rule }) => local && (rule.params?.length ?? 0) > 0)
      .map(({ rule }) => rule.name);
    for (const name of [...ir.startSymbols].sort(compareBytes)) {
      const definition = definitions.get(name);
      if (!definition?.local) {
        return fail(
          `parameter-symbol-unresolved: start ${JSON.stringify(name)} has no source definition`,
        );
      }
      if ((definition.rule.params?.length ?? 0) > 0) {
        fail(`parameter-arity-mismatch: start ${JSON.stringify(name)} requires arguments`);
      }
    }

    const terminalNames = new Set(
      ir.terminals.flatMap(({ name }) => (name === undefined ? [] : [name])),
    );
    const externals = new Map(ir.externalSymbols.map((external) => [external.name, external]));
    const occupiedNames = [
      ...definitions.keys(),
      ...terminalNames,
      ...externals.keys(),
      ...declarations.flatMap(({ rule }) => rule.params ?? []),
    ];
    const prefix = "@gramin:parameter:";
    let prefixColons = 0;
    for (const name of occupiedNames) {
      if (!name.startsWith(prefix)) continue;
      let end = prefix.length;
      while (name[end] === ":") end += 1;
      prefixColons = Math.max(prefixColons, end - prefix.length + 1);
    }
    const textEncoder = new TextEncoder();
    const generatedName = (kind: string, identity: string, owner: string): string => {
      const bytes = textEncoder.encode(identity);
      chargeKeyBytes(prefix.length + prefixColons + kind.length + 1 + bytes.byteLength * 2, owner);
      const chunks: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += 4096) {
        chunks.push(
          Array.from(bytes.subarray(offset, offset + 4096), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join(""),
        );
      }
      return `${prefix}${":".repeat(prefixColons)}${kind}:${chunks.join("")}`;
    };

    const arity = (name: string, expected: number, actual: number): void => {
      if (expected !== actual) {
        fail(
          `parameter-arity-mismatch: ${JSON.stringify(name)} expects ${expected} arguments, received ${actual}`,
        );
      }
    };
    const normalize = (
      expression: Expr,
      environment: ReadonlyMap<string, Expr>,
      depth: number,
      owner: string,
    ): Expr => {
      visit(depth, owner);
      if (expression.kind === "symbol") {
        const bound = environment.get(expression.name);
        if (bound) {
          if ((expression.args?.length ?? 0) > 0) {
            fail(
              `parameter-binding-unsupported: higher-order formal ${JSON.stringify(expression.name)} in ${JSON.stringify(owner)}`,
            );
          }
          return bound;
        }
        const definition = definitions.get(expression.name);
        if (definition) {
          arity(expression.name, definition.rule.params?.length ?? 0, expression.args?.length ?? 0);
          const args =
            expression.args?.map((argument) =>
              normalize(argument, environment, depth + 1, owner),
            ) ?? [];
          return args.length === 0
            ? { kind: "symbol", name: expression.name }
            : { kind: "symbol", name: expression.name, args };
        }
        const external = externals.get(expression.name);
        if (terminalNames.has(expression.name) || external?.kind === "terminal") {
          arity(expression.name, 0, expression.args?.length ?? 0);
          return { kind: "terminal", name: expression.name };
        }
        if (external) {
          fail(`parameter-definition-unavailable: no body for ${JSON.stringify(expression.name)}`);
        }
        return fail(
          `parameter-symbol-unresolved: ${JSON.stringify(expression.name)} in ${JSON.stringify(owner)}`,
        );
      }
      if (expression.kind === "predicate") {
        return fail(
          `predicates grammar: CFG FIRST, FOLLOW, LL(1), and SLR analysis does not apply (${JSON.stringify(owner)})`,
        );
      }
      if (expression.kind === "choice") {
        if (expression.ordered) {
          fail(
            `orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply (${JSON.stringify(owner)})`,
          );
        }
        return {
          kind: "choice",
          ordered: false,
          alts: expression.alts.map((value) => normalize(value, environment, depth + 1, owner)),
        };
      }
      if (expression.kind === "seq") {
        return {
          kind: "seq",
          items: expression.items.flatMap((value) => {
            const normalized = normalize(value, environment, depth + 1, owner);
            return normalized.kind === "seq" ? normalized.items : [normalized];
          }),
        };
      }
      if (
        expression.kind === "opt" ||
        expression.kind === "star" ||
        expression.kind === "plus" ||
        expression.kind === "group"
      ) {
        return {
          kind: expression.kind,
          expr: normalize(expression.expr, environment, depth + 1, owner),
        };
      }
      if (expression.kind === "midRuleAction") return { kind: "midRuleAction", codeLength: 0 };
      return { ...expression };
    };

    const recognitionKey = (expression: Expr, depth: number, owner: string): IdentityValue => {
      visit(depth, owner);
      if (expression.kind === "symbol") {
        return [
          "symbol",
          expression.name,
          (expression.args ?? []).map((argument) => recognitionKey(argument, depth + 1, owner)),
        ];
      }
      if (expression.kind === "terminal")
        return ["terminal", expression.name ?? null, expression.literal ?? null];
      if (expression.kind === "midRuleAction") return ["midRuleAction"];
      if (expression.kind === "seq")
        return ["seq", expression.items.map((item) => recognitionKey(item, depth + 1, owner))];
      if (expression.kind === "choice")
        return [
          "choice",
          expression.ordered,
          expression.alts.map((alt) => recognitionKey(alt, depth + 1, owner)),
        ];
      if (expression.kind === "charClass")
        return ["charClass", expression.pattern, expression.negated ?? false];
      if (expression.kind === "anyChar") return ["anyChar"];
      if (expression.kind === "predicate")
        return [
          "predicate",
          expression.positive,
          recognitionKey(expression.expr, depth + 1, owner),
        ];
      return [expression.kind, recognitionKey(expression.expr, depth + 1, owner)];
    };

    const jobs: ExpansionJob[] = [];
    for (const definition of definitions.values()) {
      if (!definition.local || (definition.rule.params?.length ?? 0) > 0) continue;
      visit(0, definition.rule.name);
      jobs.push({
        definition,
        name: definition.rule.name,
        identity: identityKey(["source", definition.rule.name], definition.rule.name),
        environment: new Map(),
      });
    }
    const instances = new Map<string, string>();
    const derivedRules: Rule[] = [];
    const instance = (definition: Definition, args: readonly Expr[], owner: string): string => {
      const identity = identityKey(
        [
          definition.local ? "local" : "provided",
          definition.rule.name,
          args.map((argument) => recognitionKey(argument, 1, owner)),
        ],
        owner,
      );
      const existing = instances.get(identity);
      if (existing !== undefined) return existing;
      reserve(definition.rule.name);
      visit(0, definition.rule.name);
      const name = generatedName("instance", identity, owner);
      instances.set(identity, name);
      instanceCount += 1;
      jobs.push({
        definition,
        name,
        identity,
        environment: new Map(
          (definition.rule.params ?? []).flatMap((param, index) => {
            const argument = args[index];
            return argument === undefined ? [] : [[param, argument] as const];
          }),
        ),
      });
      return name;
    };

    const lower = (expression: Expr, job: ExpansionJob, path: string, depth: number): Expr[] => {
      visit(depth, job.definition.rule.name);
      if (expression.kind === "symbol") {
        const definition = definitions.get(expression.name);
        if (!definition)
          return fail(`parameter-symbol-unresolved: ${JSON.stringify(expression.name)}`);
        return [
          {
            kind: "symbol",
            name:
              definition.local && (definition.rule.params?.length ?? 0) === 0
                ? definition.rule.name
                : instance(definition, expression.args ?? [], job.definition.rule.name),
          },
        ];
      }
      if (
        expression.kind === "midRuleAction" ||
        (expression.kind === "terminal" && expression.literal === "")
      )
        return [];
      if (expression.kind === "terminal") return [expression];
      if (expression.kind === "charClass" || expression.kind === "anyChar") {
        scannerless = true;
        return [expression];
      }
      if (expression.kind === "seq") {
        return expression.items.flatMap((item, index) =>
          lower(item, job, `${path}/items/${index}`, depth + 1),
        );
      }
      if (expression.kind === "group")
        return lower(expression.expr, job, `${path}/expr`, depth + 1);
      if (expression.kind === "predicate")
        return fail("predicates grammar: CFG analysis does not apply");
      reserve(job.definition.rule.name);
      visit(0, job.definition.rule.name);
      helperCount += 1;
      const name = generatedName(
        "ebnf",
        identityKey([job.identity, path], job.definition.rule.name),
        job.definition.rule.name,
      );
      const self: Expr = { kind: "symbol", name };
      const helperAlternative = (items: Expr[], recursive = false) => {
        visit(0, job.definition.rule.name);
        for (const _item of items) visit(1, job.definition.rule.name);
        if (recursive) visit(1, job.definition.rule.name);
        return { items: recursive ? [...items, self] : items };
      };
      const alternatives =
        expression.kind === "choice"
          ? expression.alts.map((alt, index) => {
              visit(0, job.definition.rule.name);
              const items = lower(alt, job, `${path}/alts/${index}`, depth + 1);
              for (const _item of items) visit(1, job.definition.rule.name);
              return { items };
            })
          : (() => {
              const items = lower(expression.expr, job, `${path}/expr`, depth + 1);
              if (expression.kind === "opt")
                return [helperAlternative(items), helperAlternative([])];
              if (expression.kind === "star")
                return [helperAlternative([]), helperAlternative(items, true)];
              return [helperAlternative(items), helperAlternative(items, true)];
            })();
      derivedRules.push({ name, alternatives });
      return [self];
    };

    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      if (!job) break;
      if (job.definition.rule.orderedAlternatives) {
        fail(
          `orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply (${JSON.stringify(job.definition.rule.name)})`,
        );
      }
      const alternatives = job.definition.rule.alternatives.map((alternative, alternativeIndex) => {
        visit(0, job.definition.rule.name);
        const items = alternative.items.flatMap((expression, itemIndex) =>
          lower(
            normalize(expression, job.environment, 1, job.definition.rule.name),
            job,
            `${alternativeIndex}/${itemIndex}`,
            1,
          ),
        );
        return { items };
      });
      derivedRules.push({ name: job.name, alternatives });
    }

    return {
      ok: true,
      ir: {
        irVersion: ir.irVersion,
        source: ir.source,
        capabilities: {
          ...ir.capabilities,
          parameterizedRules: false,
          ebnfSugar: false,
          orderedChoice: false,
          predicates: false,
          scannerless,
        },
        startSymbols: [...ir.startSymbols],
        terminals: [...ir.terminals],
        externalSymbols: [...ir.externalSymbols],
        precedence: [...ir.precedence],
        diagnostics: [...ir.diagnostics],
        rules: derivedRules.sort((left, right) => compareBytes(left.name, right.name)),
      },
      instanceCount,
      helperCount,
      nodeVisits,
      keyBytes,
      sourceRuleNames,
      omittedTemplateNames,
    };
  } catch (error) {
    if (error instanceof ExpansionFailure) return { ok: false, reason: error.message };
    throw error;
  }
};
