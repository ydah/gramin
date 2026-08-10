/** Compare strings by their UTF-8 byte representation. */
export const compareBytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
