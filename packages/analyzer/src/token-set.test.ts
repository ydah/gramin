import { describe, expect, it } from "vitest";
import { TokenUniverse } from "./token-set.js";

describe("token bitsets", () => {
  const names = Array.from({ length: 70 }, (_, index) => `語${index}`);

  it("keeps tokens distinct across signed bits and word boundaries", () => {
    const universe = new TokenUniverse(names);
    const selected = ["語0", "語31", "語32", "語63", "語64", "語69"];
    const tokens = universe.set(selected);

    expect(tokens.size).toBe(6);
    expect([...tokens]).toEqual(selected);
    for (const name of names) expect(tokens.has(name)).toBe(selected.includes(name));
    expect(tokens.has("absent")).toBe(false);
  });

  it("unions without aliasing and reports only newly added tokens", () => {
    const universe = new TokenUniverse(names);
    const left = universe.set(["語31", "語64"]);
    const right = universe.set(["語31", "語63", "語69"]);

    expect(left.addAll(right)).toBe(true);
    expect(left.size).toBe(4);
    expect(left.addAll(right)).toBe(false);
    expect([...right]).toEqual(["語31", "語63", "語69"]);
    const copy = left.clone();
    copy.add("語0");
    expect(copy.size).toBe(5);
    expect(left.size).toBe(4);
    expect(left.has("語0")).toBe(false);
  });

  it("intersects by token identity, including the last partial word", () => {
    const universe = new TokenUniverse(names);
    expect(universe.set(["語31"]).intersects(universe.set(["語63"]))).toBe(false);
    expect(universe.set(["語0", "語69"]).intersects(universe.set(["語69"]))).toBe(true);
    expect(universe.set().intersects(universe.set())).toBe(false);
  });

  it("counts complete words and rejects mixing token vocabularies", () => {
    const universe = new TokenUniverse(names);
    const all = universe.set();
    expect(all.addAll(universe.set(names))).toBe(true);
    expect(all.size).toBe(70);
    expect([...all]).toEqual(names);
    expect(new TokenUniverse([]).set().size).toBe(0);
    expect([...new TokenUniverse([]).set()]).toEqual([]);
    const different = new TokenUniverse(names).set();
    expect(() => all.addAll(different)).toThrow("token universes differ");
    expect(() => all.intersects(different)).toThrow("token universes differ");
  });

  it("treats namespace prefixes, Unicode, and end-of-input as opaque keys", () => {
    const names = ["name:字", "literal:字", "class:字", "symbol:字", "end-of-input"];
    const universe = new TokenUniverse([...names, "name:字"]);
    const tokens = universe.set(names);
    tokens.add("name:字");

    expect(tokens.size).toBe(5);
    expect([...tokens]).toEqual(names);
    expect(() => tokens.add("unknown")).toThrow("unknown token");
  });
});
