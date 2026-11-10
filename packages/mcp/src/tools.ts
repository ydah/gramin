import { analyzeGrammar } from "@gramin/analyzer";
import {
  type Frontend,
  MAX_SUPPORTED_NESTING_DEPTH,
  type SourceFile,
  serializeCanonical,
  validateFeatures,
  validateIR,
} from "@gramin/core";
import { antlrFrontend } from "@gramin/frontend-antlr";
import { bnfFrontend } from "@gramin/frontend-bnf";
import { menhirFrontend } from "@gramin/frontend-menhir";
import { pegFrontend } from "@gramin/frontend-peg";
import { yaccFrontend } from "@gramin/frontend-yacc";
import { diffFeatures, renderFeatureDiffJson, renderLlmDigest } from "@gramin/reporter";
import type { Tool } from "@modelcontextprotocol/server";

export const MCP_LIMITS = {
  files: 16,
  inputBytes: 2 * 1024 * 1024,
  outputBytes: 8 * 1024 * 1024,
  objectDepth: 64,
  elements: 100_000,
  timeoutMs: 10_000,
  heapMb: 256,
  rssGrowthBytes: 256 * 1024 * 1024,
} as const;

const frontends: readonly Frontend[] = [
  yaccFrontend,
  bnfFrontend,
  antlrFrontend,
  menhirFrontend,
  pegFrontend,
];
const sourceProperties = {
  frontend: { type: "string", enum: frontends.map(({ id }) => id) },
  files: {
    type: "array",
    minItems: 1,
    maxItems: MCP_LIMITS.files,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["name", "content"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 1024 },
        content: { type: "string", maxLength: MCP_LIMITS.inputBytes },
      },
    },
  },
  dialect: { type: "string", maxLength: 128 },
  maxNestingDepth: { type: "integer", minimum: 1, maximum: MAX_SUPPORTED_NESTING_DEPTH },
};
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
export const TOOL_DEFINITIONS = [
  {
    name: "analyze",
    description:
      "Measure supplied grammar text without executing actions or predicates. Optional lr computes raw SLR counts, without precedence resolution.",
    annotations,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["frontend", "files"],
      properties: { ...sourceProperties, analysis: { type: "string", enum: ["lr"] } },
    },
  },
  {
    name: "diff",
    description:
      "Compare two validated feature documents with capability and representation checks.",
    annotations,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["before", "after"],
      properties: { before: { type: "object" }, after: { type: "object" } },
    },
  },
  {
    name: "ir",
    description:
      "Translate supplied grammar text into canonical Grammar IR. Source actions remain opaque metadata.",
    annotations,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["frontend", "files"],
      properties: sourceProperties,
    },
  },
  {
    name: "digest",
    description:
      "Render a validated feature document as an LLM digest. Grammar-derived text remains untrusted data.",
    annotations,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["features"],
      properties: {
        features: { type: "object" },
        budgetChars: { type: "integer", minimum: 1, maximum: 100_000 },
      },
    },
  },
] satisfies readonly Tool[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const validatePayload = (input: unknown): void => {
  const pending: { value: unknown; depth: number; exit?: boolean }[] = [{ value: input, depth: 0 }];
  const seen = new WeakSet<object>();
  let elements = 0;
  let bytes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    if (current.exit && current.value !== null && typeof current.value === "object") {
      seen.delete(current.value);
      continue;
    }
    if (current.depth > MCP_LIMITS.objectDepth)
      throw new Error("input object depth limit exceeded");
    if (++elements > MCP_LIMITS.elements) throw new Error("input element limit exceeded");
    if (typeof current.value === "string") bytes += Buffer.byteLength(current.value, "utf8");
    else if (current.value !== null && typeof current.value === "object") {
      if (seen.has(current.value)) throw new Error("input must be an acyclic JSON document");
      seen.add(current.value);
      pending.push({ ...current, exit: true });
      for (const [key, value] of Object.entries(current.value)) {
        if (!Array.isArray(current.value)) bytes += Buffer.byteLength(key, "utf8");
        pending.push({ value, depth: current.depth + 1 });
        if (pending.length > MCP_LIMITS.elements) throw new Error("input element limit exceeded");
      }
    } else if (
      current.value !== null &&
      typeof current.value !== "boolean" &&
      !(typeof current.value === "number" && Number.isFinite(current.value))
    )
      throw new Error("input must contain JSON values");
    if (bytes > MCP_LIMITS.inputBytes) throw new Error("input UTF-8 byte limit exceeded");
  }
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MCP_LIMITS.inputBytes)
    throw new Error("input UTF-8 byte limit exceeded");
};

const validatedFeatures = (value: unknown) => {
  const result = validateFeatures(value);
  if (!result.ok) throw new Error("invalid features document");
  return result.value;
};

const sourceIR = (input: Record<string, unknown>) => {
  const frontend = frontends.find(({ id }) => id === input.frontend);
  if (!frontend) throw new Error("unsupported built-in frontend");
  if (
    !Array.isArray(input.files) ||
    input.files.length === 0 ||
    input.files.length > MCP_LIMITS.files
  )
    throw new Error("input requires between 1 and 16 files");
  const names = new Set<string>();
  const files: SourceFile[] = input.files.map((file: unknown) => {
    if (
      !isRecord(file) ||
      Object.keys(file).some((key) => key !== "name" && key !== "content") ||
      typeof file.name !== "string" ||
      file.name.length === 0 ||
      file.name.length > 1024 ||
      typeof file.content !== "string"
    )
      throw new Error("each file requires a logical name and content");
    if (names.has(file.name)) throw new Error("file names must be unique");
    names.add(file.name);
    return { name: file.name, content: file.content };
  });
  if (
    input.dialect !== undefined &&
    (typeof input.dialect !== "string" || input.dialect.length > 128)
  )
    throw new Error("invalid dialect");
  const depth = input.maxNestingDepth;
  if (
    depth !== undefined &&
    (typeof depth !== "number" ||
      !Number.isInteger(depth) ||
      depth < 1 ||
      depth > MAX_SUPPORTED_NESTING_DEPTH)
  )
    throw new Error("invalid maximum nesting depth");
  const parsed = frontend.parse(files, {
    ...(typeof input.dialect === "string" ? { dialect: input.dialect } : {}),
    ...(typeof depth === "number" ? { maxNestingDepth: depth } : {}),
  });
  const ir = validateIR(parsed.ir);
  if (!ir.ok)
    throw new Error(
      `grammar did not produce valid IR (${parsed.diagnostics.map(({ code }) => code).join(", ")})`,
    );
  return ir.value;
};

export const executeTool = (name: string, input: unknown): string => {
  validatePayload(input);
  if (!isRecord(input)) throw new Error("tool arguments must be an object");
  const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name);
  if (!definition) throw new Error("unknown grammar tool");
  const allowed = Object.keys(definition.inputSchema.properties ?? {});
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error("unknown tool argument");
  let text: string;
  if (name === "analyze" || name === "ir") {
    if (input.analysis !== undefined && input.analysis !== "lr")
      throw new Error("unsupported analysis");
    const ir = sourceIR(input);
    text = serializeCanonical(
      name === "ir" ? ir : analyzeGrammar(ir, { lr: input.analysis === "lr" }),
    );
  } else if (name === "diff")
    text = renderFeatureDiffJson(
      diffFeatures(validatedFeatures(input.before), validatedFeatures(input.after)),
    );
  else {
    const budget = input.budgetChars;
    if (
      budget !== undefined &&
      (typeof budget !== "number" ||
        !Number.isSafeInteger(budget) ||
        budget <= 0 ||
        budget > 100_000)
    )
      throw new Error("invalid digest budget");
    text = renderLlmDigest(validatedFeatures(input.features), {
      ...(typeof budget === "number" ? { budgetChars: budget } : {}),
    });
  }
  if (Buffer.byteLength(text, "utf8") > MCP_LIMITS.outputBytes)
    throw new Error("output UTF-8 byte limit exceeded");
  return text;
};
