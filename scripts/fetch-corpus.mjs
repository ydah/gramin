import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const destination = resolve(process.argv[2] ?? "fixtures/downloaded");
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  throw new Error("refusing corpus download with TLS certificate verification disabled");
}
const sources = [
  [
    "bison/calc.y",
    "https://raw.githubusercontent.com/akimd/bison/25b3d0e1a3f97a33615099e4b211f3953990c203/examples/c/calc/calc.y",
  ],
  [
    "perl/perly.y",
    "https://raw.githubusercontent.com/Perl/perl5/44f4945c88a0598be10ee67b689de6ff4bf84bc1/perly.y",
  ],
  [
    "ruby/parse.y",
    "https://raw.githubusercontent.com/ruby/ruby/33db313e855dfa83d7c66c2de6d63b9b401c32a0/parse.y",
  ],
  [
    "php/zend_language_parser.y",
    "https://raw.githubusercontent.com/php/php-src/f77523b538bd39c94144c5b8edb85e5230369d45/Zend/zend_language_parser.y",
  ],
  [
    "antlr/json/JSON.g4",
    "https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/json/JSON.g4",
  ],
  [
    "antlr/sqlite/SQLiteParser.g4",
    "https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/sql/sqlite/SQLiteParser.g4",
  ],
  [
    "antlr/sqlite/SQLiteLexer.g4",
    "https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/sql/sqlite/SQLiteLexer.g4",
  ],
  [
    "antlr/java/JavaParser.g4",
    "https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/java/java/JavaParser.g4",
  ],
  [
    "antlr/java/JavaLexer.g4",
    "https://raw.githubusercontent.com/antlr/grammars-v4/e756f2a2ee5565a9300666f100ba6acd874664f7/java/java/JavaLexer.g4",
  ],
];

const expectedSha256 = new Map([
  ["bison/calc.y", "59259755e8619ebb514b1c1832de28574341efbb64f3f593318961c0cfa4aa1b"],
  ["perl/perly.y", "783af8ff7ff42fd7313d85df8bbde58d7480e4964bb41ce7b92a5039a7286074"],
  ["ruby/parse.y", "90ff67d6f610bacc24439dfac6c1c30ed9eb08aa8b80225c0f074947f1894bb5"],
  [
    "php/zend_language_parser.y",
    "afb7ad325d4bd7ca4bb037c96dd31e8afdd0652469f0248cc4139a475f0d5e98",
  ],
  ["antlr/json/JSON.g4", "1ec0e422caf2855be3497efaeb5e23f91adc6a65068757e2dcf83467119986f4"],
  [
    "antlr/sqlite/SQLiteParser.g4",
    "0b2e81506c7794a065d7b542f48f232fd0d89682123106818b4bb0b635aa1186",
  ],
  [
    "antlr/sqlite/SQLiteLexer.g4",
    "19fa347a41eddc482d818549c5b06c047f52393320b8e9bdf6f783450f8d0e50",
  ],
  ["antlr/java/JavaParser.g4", "2a40776fbb3d6d30a90989e794bea5fa7488ecbe515253334847a62046fe9a09"],
  ["antlr/java/JavaLexer.g4", "b8d9b65d796197d234a1adaddd152afe491e9e411e6a6aad5300fe62df158ea6"],
]);

const wait = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const fetchText = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await wait(2 ** attempt * 1_000);
    }
  }
  throw new Error(
    `failed to fetch ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
};

const verifySha256 = (path, content) => {
  const expected = expectedSha256.get(path);
  if (!expected) throw new Error(`missing SHA-256 manifest entry for ${path}`);
  const actual = createHash("sha256").update(content, "utf8").digest("hex");
  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch for ${path}: expected ${expected}, got ${actual}`);
  }
};

await Promise.all(
  sources.map(async ([path, url]) => {
    const content = await fetchText(url);
    verifySha256(path, content);
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }),
);
