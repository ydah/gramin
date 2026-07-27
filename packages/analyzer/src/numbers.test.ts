import { describe, expect, it } from "vitest";
import { nearestRankPercentile } from "./numbers.js";

describe("nearestRankPercentile", () => {
  it("uses deterministic nearest ranks for small and unsorted samples", () => {
    expect(nearestRankPercentile([7, 1, 1, 1, 1, 1, 1, 1, 1, 1], 0.5)).toBe(1);
    expect(nearestRankPercentile([7, 1, 1, 1, 1, 1, 1, 1, 1, 1], 0.95)).toBe(7);
    expect(nearestRankPercentile([3], 0.95)).toBe(3);
  });

  it("omits empty samples and rejects invalid percentile bounds", () => {
    expect(nearestRankPercentile([], 0.5)).toBeUndefined();
    expect(() => nearestRankPercentile([1], 0)).toThrow(RangeError);
    expect(() => nearestRankPercentile([1], 1.01)).toThrow(RangeError);
  });
});
