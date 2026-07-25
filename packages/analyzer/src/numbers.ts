export const round4 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 10_000) / 10_000;

export const compareBytes = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};
