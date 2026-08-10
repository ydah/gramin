export const round4 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 10_000) / 10_000;

export const nearestRankPercentile = (
  values: readonly number[],
  percentile: number,
): number | undefined => {
  if (percentile <= 0 || percentile > 1) {
    throw new RangeError(`percentile must be greater than 0 and at most 1: ${percentile}`);
  }
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
};
export { compareBytes } from "@gramin/core";
