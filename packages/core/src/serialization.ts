import { compareBytes } from "./ordering.js";

const normalizeValue = (value: unknown, stripLocations: boolean): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry, stripLocations));
  }

  if (value === null || typeof value !== "object") return value;

  const entries = Object.entries(value)
    .filter(([key]) => !(stripLocations && key === "loc"))
    .sort(([left], [right]) => compareBytes(left, right));

  return Object.fromEntries(
    entries.map(([key, entry]) => [key, normalizeValue(entry, stripLocations)]),
  );
};

export interface SerializationOptions {
  readonly stripLocations?: boolean;
}

export const canonicalize = (value: unknown, options: SerializationOptions = {}): unknown =>
  normalizeValue(value, options.stripLocations ?? false);

export const serializeCanonical = (value: unknown, options: SerializationOptions = {}): string =>
  `${JSON.stringify(canonicalize(value, options), null, 2)}\n`;
