import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ANALYZER_VERSION, analyzeGrammar } from "../packages/analyzer/dist/index.js";
import {
  compareBytes,
  FEATURES_VERSION,
  IR_VERSION,
  serializeCanonical,
  validateIR,
} from "../packages/core/dist/index.js";
import { antlrFrontend } from "../packages/frontend-antlr/dist/index.js";
import { bnfFrontend } from "../packages/frontend-bnf/dist/index.js";
import { menhirFrontend } from "../packages/frontend-menhir/dist/index.js";
import { pegFrontend } from "../packages/frontend-peg/dist/index.js";
import { yaccFrontend } from "../packages/frontend-yacc/dist/index.js";
import { renderFeatureCsv } from "../packages/reporter/dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceLimit = 5 * 1024 * 1024;
const frontends = new Map(
  [antlrFrontend, bnfFrontend, menhirFrontend, pegFrontend, yaccFrontend].map((frontend) => [
    frontend.id,
    frontend,
  ]),
);
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const safePath = (path) =>
  typeof path === "string" &&
  path.length > 0 &&
  /^[A-Za-z0-9_./-]+$/u.test(path) &&
  !isAbsolute(path) &&
  !path.startsWith("-") &&
  !path.split("/").includes("..") &&
  posix.normalize(path) === path;

export const validateAtlasManifest = (input) => {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100)
    throw new Error("expected 1–100 Atlas entries");
  const ids = new Set();
  for (const entry of input) {
    if (!entry || typeof entry !== "object" || !/^[a-z0-9][a-z0-9.-]*$/u.test(entry.id ?? ""))
      throw new Error("invalid Atlas id");
    if (["atlas", "index", "ruby-history"].includes(entry.id))
      throw new Error(`reserved Atlas id ${entry.id}`);
    if (ids.has(entry.id)) throw new Error(`duplicate Atlas id ${entry.id}`);
    ids.add(entry.id);
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(entry.repository ?? "") ||
      !/^[a-f0-9]{40}$/u.test(entry.revision ?? "")
    )
      throw new Error(`invalid immutable source for ${entry.id}`);
    if (!frontends.has(entry.frontend) || !["atlas", "ruby-history"].includes(entry.category))
      throw new Error(`invalid frontend/category for ${entry.id}`);
    if (
      typeof entry.title !== "string" ||
      !entry.title ||
      /[\r\n]/u.test(entry.title) ||
      typeof entry.license !== "string" ||
      !entry.license ||
      !safePath(entry.licensePath)
    )
      throw new Error(`invalid attribution for ${entry.id}`);
    if (entry.analysis !== undefined && entry.analysis !== "lr")
      throw new Error(`invalid analysis for ${entry.id}`);
    if (
      !Array.isArray(entry.files) ||
      entry.files.length === 0 ||
      entry.files.length > 16 ||
      new Set(entry.files.map((file) => file.path)).size !== entry.files.length
    )
      throw new Error(`invalid files for ${entry.id}`);
    for (const file of entry.files) {
      if (
        !safePath(file.path) ||
        !/^[a-f0-9]{64}$/u.test(file.sha256 ?? "") ||
        (file.cachePath !== undefined && !safePath(file.cachePath))
      )
        throw new Error(`invalid source path/hash for ${entry.id}`);
    }
  }
  return input;
};

const sourceUrl = (entry, file) =>
  `https://raw.githubusercontent.com/${entry.repository}/${entry.revision}/${file.path}`;
const cachePath = (entry, file) =>
  join(root, "fixtures/downloaded", file.cachePath ?? `atlas/${entry.id}/${file.path}`);

export const measureAtlas = async (
  manifest,
  { readSource = (entry, file) => readFile(cachePath(entry, file), "utf8") } = {},
) => {
  const entries = [];
  for (const entry of [...validateAtlasManifest(manifest)].sort((a, b) =>
    compareBytes(a.id, b.id),
  )) {
    const sources = [];
    const provenance = [];
    for (const file of entry.files) {
      const content = await readSource(entry, file);
      if (typeof content !== "string" || Buffer.byteLength(content) > sourceLimit)
        throw new Error(`source exceeds 5 MiB: ${entry.id}/${file.path}`);
      if (sha256(content) !== file.sha256)
        throw new Error(`SHA-256 mismatch: ${entry.id}/${file.path}`);
      sources.push({ name: file.path, content });
      provenance.push({
        path: file.path,
        sha256: file.sha256,
        bytes: Buffer.byteLength(content),
        url: sourceUrl(entry, file),
      });
    }
    const parsed = frontends
      .get(entry.frontend)
      .parse(sources, entry.dialect ? { dialect: entry.dialect } : {});
    const validated = validateIR(parsed.ir);
    const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    if (!validated.ok || errors.length > 0)
      throw new Error(
        `parse failed for ${entry.id}: ${serializeCanonical(errors.length ? errors : validated.issues)}`,
      );
    const features = analyzeGrammar(validated.value, { lr: entry.analysis === "lr" });
    entries.push({
      id: entry.id,
      title: entry.title,
      category: entry.category,
      ...(entry.release === undefined ? {} : { release: entry.release }),
      provenance: {
        repository: entry.repository,
        revision: entry.revision,
        license: entry.license,
        licenseUrl: `https://github.com/${entry.repository}/blob/${entry.revision}/${entry.licensePath}`,
        files: provenance,
      },
      measurement: {
        frontend: entry.frontend,
        ...(entry.dialect ? { dialect: entry.dialect } : {}),
        analysis: entry.analysis ?? "default",
      },
      features,
    });
  }
  return {
    datasetVersion: "1.0.0",
    software: {
      analyzerVersion: ANALYZER_VERSION,
      irVersion: IR_VERSION,
      featuresVersion: FEATURES_VERSION,
    },
    entries,
  };
};

const fetchSource = async (entry, file) => {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    throw new Error("TLS verification must remain enabled");
  const response = await fetch(sourceUrl(entry, file), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${sourceUrl(entry, file)}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > sourceLimit) throw new Error(`source exceeds 5 MiB: ${entry.id}/${file.path}`);
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks).toString("utf8");
  if (sha256(content) !== file.sha256)
    throw new Error(`SHA-256 mismatch: ${entry.id}/${file.path}`);
  const destination = cachePath(entry, file);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content);
};

const markdown = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replaceAll("[", "&#91;");
const measured = (value) => (value === undefined ? "unavailable" : String(value));
const summaryRow = (entry) =>
  `| [${markdown(entry.title)}](./${entry.id}) | ${entry.features.size.rules} | ${entry.features.size.alternatives} | ${entry.features.structure.recursiveRules.count} | ${measured(entry.features.sugar.parameterizedRuleDefs)} | ${measured(entry.features.parseability.slr?.states)} |`;
const table = (entries) =>
  `| Grammar | Source rules | Alternatives | Recursive rules | Parameter definitions | Raw LR(0) states |\n|---|---:|---:|---:|---:|---:|\n${entries.map(summaryRow).join("\n")}`;

const rubyRuleChart = (entries) => {
  const escapeXml = (text) =>
    String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const maximum = Math.max(1, ...entries.map((entry) => entry.features.size.rules));
  const step = 600 / Math.max(entries.length, 1);
  const bars = entries
    .map((entry, index) => {
      const height = Math.round((entry.features.size.rules / maximum) * 160);
      const center = 40 + step * (index + 0.5);
      return `<rect x="${center - 20}" y="${220 - height}" width="40" height="${height}" fill="#0b6b66"/><text x="${center}" y="${210 - height}" text-anchor="middle">${entry.features.size.rules}</text><text x="${center}" y="246" text-anchor="middle">${escapeXml((entry.release ?? entry.id).replaceAll("_", "."))}</text>`;
    })
    .join("");
  const description = entries
    .map((entry) => `${entry.release ?? entry.id}: ${entry.features.size.rules} source rules`)
    .join("; ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 285" role="img" aria-labelledby="title description"><title id="title">Ruby parse.y source rules by release</title><desc id="description">${escapeXml(description)}</desc><rect width="680" height="285" fill="#fbfaf5"/><g font-family="system-ui,sans-serif" font-size="13" fill="#172522"><text x="40" y="28" font-size="18">Source rules in each pinned parse.y</text><path d="M40 48V220H650" fill="none" stroke="#7c8985"/><text x="28" y="224" text-anchor="end">0</text>${bars}<text x="40" y="273" font-size="11">Source representation counts; parameter expansion does not change this population.</text></g></svg>\n`;
};

export const writeAtlas = async (
  atlas,
  { directory = join(root, "apps/site/public/atlas"), pages = join(root, "apps/site/atlas") } = {},
) => {
  let previousIds = [];
  try {
    const previous = JSON.parse(await readFile(join(directory, "atlas.json"), "utf8"));
    previousIds = previous.entries.map((entry) => entry.id);
    if (
      previousIds.some(
        (id) =>
          typeof id !== "string" ||
          !/^[a-z0-9][a-z0-9.-]*$/u.test(id) ||
          ["atlas", "index", "ruby-history"].includes(id),
      )
    )
      throw new Error("invalid previous Atlas output identity");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(directory, { recursive: true });
  await mkdir(pages, { recursive: true });
  await writeFile(join(directory, "atlas.json"), serializeCanonical(atlas));
  await writeFile(
    join(directory, "atlas.csv"),
    renderFeatureCsv(atlas.entries.map((entry) => ({ name: entry.id, features: entry.features }))),
  );
  const intro =
    "These are measurements of pinned source representations, not a complexity ranking or a claim that different grammars recognize equivalent languages. Source actions and predicates were not executed. Raw SLR counts omit precedence resolution and cannot be compared with generator conflict declarations.\n\n";
  const download =
    "[Full JSON dataset](/atlas/atlas.json) · [Full CSV dataset](/atlas/atlas.csv)\n\n";
  const index = `# Grammar Atlas

${intro}${download}${table(atlas.entries.filter((entry) => entry.category === "atlas"))}

[Explore the Ruby parse.y chronicle](./ruby-history).

## Reproduce and compare

Every page records an immutable upstream commit, input SHA-256 hashes, the frontend, and the effective measurement context. Downloaded source remains in an ignored cache; only derived measurements are published. The source links retain access to upstream copyright and license notices.

Measurements are regenerated weekly from the pinned manifest and the current gramin implementation. To change the sampled source revisions, update the manifest commits and hashes through review. Identical source, software and options produce identical dataset bytes; timestamps are deliberately omitted.

Class A refers to representation-level counts. Class B requires matching capability/representation context; class C also depends on source conventions. Use the [sandbox](../sandbox) or \`gramin diff --features\` to apply the comparison gates. Missing values remain unavailable.

Dataset contract 1.0.0; analyzer ${atlas.software.analyzerVersion}, Grammar IR ${atlas.software.irVersion}, features ${atlas.software.featuresVersion}.
`;
  await writeFile(join(pages, "index.md"), index);
  for (const entry of atlas.entries) {
    await writeFile(join(directory, `${entry.id}.json`), serializeCanonical(entry));
    const context = entry.features.parseability.context;
    const files = entry.provenance.files
      .map(
        (file) => `| [${markdown(file.path)}](${file.url}) | ${file.bytes} | \`${file.sha256}\` |`,
      )
      .join("\n");
    const page = `# ${markdown(entry.title)}

${intro}[This grammar as JSON](/atlas/${entry.id}.json) · [All grammar vectors as CSV](/atlas/atlas.csv) · [Atlas](./)

${table([entry])}

## Source and provenance

- Repository: [${markdown(entry.provenance.repository)}](https://github.com/${entry.provenance.repository})
- Commit: [\`${entry.provenance.revision}\`](https://github.com/${entry.provenance.repository}/commit/${entry.provenance.revision})
${
  entry.release === undefined
    ? ""
    : `- Release tag: \`${markdown(entry.release)}\`
`
}- License: [${markdown(entry.provenance.license)}](${entry.provenance.licenseUrl})
- Frontend: \`${entry.measurement.frontend}\`${entry.measurement.dialect ? `, dialect \`${entry.measurement.dialect}\`` : ""}; analysis: \`${entry.measurement.analysis}\`

| Input | UTF-8 bytes | SHA-256 |
|---|---:|---|
${files}

## Comparison context

Source capabilities remain those of the original IR:

\`\`\`json
${JSON.stringify(entry.features.capabilities, null, 2)}
\`\`\`

${
  context === undefined
    ? "FIRST/FOLLOW, LL(1), and raw SLR use the source representation when applicable. See the JSON for each unavailable measurement and its reason."
    : `Parseability uses a concrete derived representation; source size and structure remain source-based. Aggregate parseability covers ${context.concreteRules} concrete rules, including ${context.parameterInstances} parameter instances and ${context.ebnfHelpers} EBNF helpers.

\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\``
}

The JSON retains all rule vectors, diagnostics, unavailable reasons and measurement domains. Source facts, derived measurements and unavailable template-level values must not be pooled as one rule population.
`;
    await writeFile(join(pages, `${entry.id}.md`), page);
  }
  const history = atlas.entries
    .filter((entry) => entry.category === "ruby-history")
    .sort((a, b) => compareBytes(a.id, b.id));
  await writeFile(join(directory, "ruby-rules.svg"), rubyRuleChart(history));
  const chronicle = `# Ruby parse.y chronicle

${intro}${download}![Source rule counts across the sampled Ruby releases](/atlas/ruby-rules.svg)

${table(history)}

## Reading the history

These snapshots sample release tags rather than every change. Ruby's [3.3.0 release notes](https://www.ruby-lang.org/en/news/2023/12/25/ruby-3-3-0-released/) document the switch from Bison to Lrama and parameterized-rule support. The table records what this frontend captures in each pinned \`parse.y\`; it does not attribute every numeric change to that transition. Ruby's alternative Prism parser is outside this dataset.

Rule and alternative counts describe source structure. A parameterized representation can change those counts without a corresponding change in the recognized language. FIRST/FOLLOW, LL(1), and raw SLR may instead use the recorded concrete expansion, while the source structural measurements retain their original population. Follow each release page for its capabilities, raw data and unavailable reasons.

Comparability depends on the feature version, capability flags and representation policy. A timeline is contextual evidence, not permission to subtract every column across all releases.
`;
  await writeFile(join(pages, "ruby-history.md"), chronicle);
  const currentIds = new Set(atlas.entries.map((entry) => entry.id));
  for (const id of previousIds) {
    if (currentIds.has(id)) continue;
    await rm(join(directory, `${id}.json`), { force: true });
    await rm(join(pages, `${id}.md`), { force: true });
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--fetch"))
    throw new Error("Usage: node scripts/atlas.mjs [--fetch]");
  const manifest = validateAtlasManifest(
    JSON.parse(await readFile(join(root, "data/atlas/manifest.json"), "utf8")),
  );
  if (args.includes("--fetch"))
    for (const entry of manifest) for (const file of entry.files) await fetchSource(entry, file);
  const atlas = await measureAtlas(manifest);
  await writeAtlas(atlas);
  console.log(
    `Generated ${atlas.entries.length} pinned grammar measurements, JSON/CSV and Atlas pages.`,
  );
}
