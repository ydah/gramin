import { Type } from "@sinclair/typebox";

export const SemverStringSchema = Type.String({
  pattern:
    "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
});

export const SourceSpanSchema = Type.Object(
  {
    startLine: Type.Integer({ minimum: 1 }),
    startCol: Type.Integer({ minimum: 1 }),
    endLine: Type.Integer({ minimum: 1 }),
    endCol: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const DiagnosticSchema = Type.Object(
  {
    severity: Type.Union([Type.Literal("error"), Type.Literal("warning"), Type.Literal("info")]),
    code: Type.String({ minLength: 1 }),
    message: Type.String(),
    loc: Type.Optional(SourceSpanSchema),
  },
  { additionalProperties: false },
);
