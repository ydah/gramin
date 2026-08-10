export interface CodeSpanOptions {
  readonly escapeBackslashes?: boolean;
}

export const codeSpan = (value: string, options: CodeSpanOptions = {}): string => {
  const normalized = value
    .replaceAll("\\", options.escapeBackslashes === false ? "\\" : "\\\\")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
  const runs = normalized.match(/`+/gu) ?? [];
  const fenceLength = runs.reduce((maximum, run) => Math.max(maximum, run.length + 1), 1);
  const fence = "`".repeat(fenceLength);
  const padding = normalized.startsWith("`") || normalized.endsWith("`") ? " " : "";
  return `${fence}${padding}${normalized}${padding}${fence}`;
};

export const tableCodeSpan = (value: string): string =>
  codeSpan(value, { escapeBackslashes: false }).replaceAll("|", "\\|");
