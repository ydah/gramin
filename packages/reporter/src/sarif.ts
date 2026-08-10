import type { GrammarFeatures } from "@gramin/core";

interface SarifRule {
  readonly id: string;
  readonly shortDescription: { readonly text: string };
}

interface SarifResult {
  readonly ruleId: string;
  readonly level: "error" | "warning" | "note";
  readonly message: { readonly text: string };
  readonly locations?: readonly [
    {
      readonly physicalLocation: {
        readonly artifactLocation: { readonly uri: string };
        readonly region: {
          readonly startLine: number;
          readonly startColumn: number;
          readonly endLine?: number;
          readonly endColumn?: number;
        };
      };
    },
  ];
}

const levelFor = (severity: "info" | "warning" | "error"): SarifResult["level"] =>
  severity === "info" ? "note" : severity;

export const renderSarif = (features: GrammarFeatures): string => {
  const diagnostics = features.diagnostics;
  const rules: SarifRule[] = [];
  const seen = new Set<string>();
  diagnostics.forEach((diagnostic) => {
    if (seen.has(diagnostic.code)) return;
    seen.add(diagnostic.code);
    rules.push({
      id: diagnostic.code,
      shortDescription: { text: diagnostic.message },
    });
  });
  const fileName = features.source.fileNames?.[0];
  const results: SarifResult[] = diagnostics.map((diagnostic) => ({
    ruleId: diagnostic.code,
    level: levelFor(diagnostic.severity),
    message: { text: diagnostic.message },
    ...(diagnostic.loc && fileName
      ? {
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: fileName },
                region: {
                  startLine: diagnostic.loc.startLine,
                  startColumn: diagnostic.loc.startCol,
                  endLine: diagnostic.loc.endLine,
                  endColumn: diagnostic.loc.endCol,
                },
              },
            },
          ] as const,
        }
      : {}),
  }));
  return `${JSON.stringify(
    {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "gramin",
              informationUri: "https://github.com/ydah/gramin",
              rules,
            },
          },
          results,
        },
      ],
    },
    null,
    2,
  )}\n`;
};
