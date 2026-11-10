import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { measureAtlas, validateAtlasManifest, writeAtlas } from "./atlas.mjs";

const grammar = 's ::= "x";';
const hash = createHash("sha256").update(grammar).digest("hex");
const entry = {
  id: "example",
  title: "Example",
  category: "atlas",
  repository: "example/grammar",
  revision: "a".repeat(40),
  frontend: "bnf",
  license: "See upstream source notices",
  licensePath: "LICENSE",
  files: [{ path: "grammar.bnf", sha256: hash }],
};

describe("Grammar Atlas", () => {
  it.each(["atlas", "index", "ruby-history"])("rejects the reserved output id %s", (id) => {
    expect(() => validateAtlasManifest([{ ...entry, id }])).toThrow(/reserved/u);
  });
  it("validates output identities and immutable source provenance", () => {
    expect(validateAtlasManifest([entry])).toEqual([entry]);
    for (const changed of [
      { id: "../escape" },
      { repository: "../../other" },
      { revision: "main" },
      { frontend: "command" },
      { files: [{ path: "../secret", sha256: hash }] },
      { files: [{ path: "/secret", sha256: hash }] },
      { files: [{ path: "C:/secret", sha256: hash }] },
      { files: [{ path: "%2e%2e/secret", sha256: hash }] },
      { files: [{ path: "-option", sha256: hash }] },
      { files: [{ path: "grammar.bnf", sha256: "unknown" }] },
    ])
      expect(() => validateAtlasManifest([{ ...entry, ...changed }])).toThrow();
    expect(() => validateAtlasManifest([entry, entry])).toThrow(/duplicate/u);
  });

  it("verifies bytes before parsing and preserves measured zero versus unavailable", async () => {
    const atlas = await measureAtlas([entry], { readSource: async () => grammar });
    expect(atlas.entries[0]?.features.size.rules).toBe(1);
    expect(atlas.entries[0]?.features.parseability.ll1Conflicts.total).toBe(0);
    expect(atlas.entries[0]?.features.parseability.notApplicable.slr).toBeDefined();
    expect(atlas.entries[0]?.provenance.files[0]).toMatchObject({
      path: "grammar.bnf",
      sha256: hash,
      bytes: Buffer.byteLength(grammar),
      url: `https://raw.githubusercontent.com/example/grammar/${"a".repeat(40)}/grammar.bnf`,
    });
    await expect(
      measureAtlas([entry], { readSource: async () => 's ::= "changed";' }),
    ).rejects.toThrow(/SHA-256/u);
  });

  it("returns byte-stable data regardless of manifest ordering", async () => {
    const other = { ...entry, id: "other", title: "Other" };
    const options = { readSource: async () => grammar };
    expect(JSON.stringify(await measureAtlas([entry, other], options))).toBe(
      JSON.stringify(await measureAtlas([other, entry], options)),
    );
  });

  it("records parse failures rather than publishing partial measurements", async () => {
    const broken = "this is not a grammar";
    const source = {
      ...entry,
      files: [{ path: "broken.bnf", sha256: createHash("sha256").update(broken).digest("hex") }],
    };
    await expect(measureAtlas([source], { readSource: async () => broken })).rejects.toThrow(
      /parse/u,
    );
  });

  it("removes obsolete generated entries while preserving unrelated files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gramin-atlas-"));
    const pages = join(directory, "pages");
    try {
      const atlas = await measureAtlas([entry, { ...entry, id: "removed" }], {
        readSource: async () => grammar,
      });
      await writeAtlas(atlas, { directory, pages });
      await writeFile(join(pages, "notes.md"), "keep");
      await writeAtlas(
        { ...atlas, entries: atlas.entries.filter(({ id }) => id !== "removed") },
        { directory, pages },
      );
      await expect(access(join(directory, "removed.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(access(join(pages, "removed.md"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(join(pages, "notes.md"), "utf8")).toBe("keep");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("publishes complete vectors and attributed pages without rendering source text as HTML", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gramin-atlas-"));
    try {
      const atlas = await measureAtlas(
        [
          {
            ...entry,
            title: "<script>Example</script>",
            category: "ruby-history",
            release: "v1.0.0",
          },
        ],
        { readSource: async () => grammar },
      );
      await writeAtlas(atlas, { directory, pages: join(directory, "pages") });
      expect(
        JSON.parse(await readFile(join(directory, "example.json"), "utf8")).features.perRule,
      ).toEqual(atlas.entries[0]?.features.perRule);
      expect(await readFile(join(directory, "atlas.csv"), "utf8")).toContain(
        "example,rule,s,alternatives,1,",
      );
      const page = await readFile(join(directory, "pages/example.md"), "utf8");
      expect(page).toContain("&lt;script>Example&lt;/script>");
      expect(page).toContain(hash);
      expect(page).toContain("unavailable measurement and its reason");
      const history = await readFile(join(directory, "pages/ruby-history.md"), "utf8");
      expect(history).toContain("not attribute every numeric change");
      expect(history).toContain("](/atlas/ruby-rules.svg)");
      const chart = await readFile(join(directory, "ruby-rules.svg"), "utf8");
      expect(chart).toContain('role="img"');
      expect(chart).toContain("v1.0.0: 1 source rules");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
