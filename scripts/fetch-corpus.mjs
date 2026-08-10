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

await Promise.all(
  sources.map(async ([path, url]) => {
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await fetchText(url));
  }),
);
