const bitCount = (value: number): number => {
  const pairs = value - ((value >>> 1) & 0x55555555);
  const nibbles = (pairs & 0x33333333) + ((pairs >>> 2) & 0x33333333);
  return (((nibbles + (nibbles >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

export class TokenUniverse {
  readonly keys: readonly string[];
  readonly indices: ReadonlyMap<string, number>;

  constructor(keys: Iterable<string>) {
    this.keys = [...new Set(keys)];
    this.indices = new Map(this.keys.map((key, index) => [key, index]));
  }

  set(values: Iterable<string> = []): TokenSet {
    return new TokenSet(this, values);
  }
}

export class TokenSet {
  private readonly words: Uint32Array;
  private count = 0;

  constructor(
    private readonly universe: TokenUniverse,
    values: Iterable<string> = [],
  ) {
    this.words = new Uint32Array(Math.ceil(universe.keys.length / 32));
    for (const value of values) this.add(value);
  }

  get size(): number {
    return this.count;
  }

  add(value: string): this {
    const index = this.universe.indices.get(value);
    if (index === undefined) throw new Error(`unknown token: ${value}`);
    const word = index >>> 5;
    const mask = 1 << (index & 31);
    if (((this.words[word] ?? 0) & mask) === 0) {
      this.words[word] = (this.words[word] ?? 0) | mask;
      this.count += 1;
    }
    return this;
  }

  has(value: string): boolean {
    const index = this.universe.indices.get(value);
    return index !== undefined && ((this.words[index >>> 5] ?? 0) & (1 << (index & 31))) !== 0;
  }

  addAll(other: TokenSet): boolean {
    if (other.universe !== this.universe) throw new Error("token universes differ");
    const before = this.count;
    for (let index = 0; index < this.words.length; index += 1) {
      const previous = this.words[index] ?? 0;
      const next = (previous | (other.words[index] ?? 0)) >>> 0;
      this.words[index] = next;
      this.count += bitCount(next ^ previous);
    }
    return this.count !== before;
  }

  intersects(other: TokenSet): boolean {
    if (other.universe !== this.universe) throw new Error("token universes differ");
    return this.words.some((word, index) => (word & (other.words[index] ?? 0)) !== 0);
  }

  clone(): TokenSet {
    const copy = this.universe.set();
    copy.words.set(this.words);
    copy.count = this.count;
    return copy;
  }

  *[Symbol.iterator](): IterableIterator<string> {
    for (let index = 0; index < this.words.length; index += 1) {
      let word = this.words[index] ?? 0;
      while (word !== 0) {
        const bit = 31 - Math.clz32(word & -word);
        const key = this.universe.keys[index * 32 + bit];
        if (key !== undefined) yield key;
        word = (word & (word - 1)) >>> 0;
      }
    }
  }
}
