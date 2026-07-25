import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeGrammar } from "../packages/analyzer/dist/index.js";
import { serializeCanonical } from "../packages/core/dist/index.js";
import { bnfFrontend } from "../packages/frontend-bnf/dist/index.js";
import { yaccFrontend } from "../packages/frontend-yacc/dist/index.js";

if (!process.argv.includes("--update-golden")) {
  process.stderr.write("Refusing to update golden files without --update-golden\n");
  process.exitCode = 3;
} else {
  const fixtureDirectory = resolve("packages/frontend-yacc/fixtures");
  const goldenDirectory = resolve(fixtureDirectory, "golden");
  const names = [
    "calc",
    "empty",
    "indirect-recursion",
    "alias",
    "precedence-override",
    "adversarial-actions",
    "raw-string",
    "lrama",
  ];
  await mkdir(goldenDirectory, { recursive: true });
  for (const name of names) {
    const fileName = `${name}.y`;
    const content = await readFile(resolve(fixtureDirectory, fileName), "utf8");
    const result = yaccFrontend.parse([{ name: fileName, content }], {});
    if (!result.ir) throw new Error(`Could not generate IR for ${fileName}`);
    const strippedIRText = serializeCanonical(result.ir, { stripLocations: true });
    const strippedIR = JSON.parse(strippedIRText);
    await writeFile(resolve(goldenDirectory, `${name}.ir.json`), strippedIRText);
    await writeFile(resolve(goldenDirectory, `${name}.ir-loc.json`), serializeCanonical(result.ir));
    await writeFile(
      resolve(goldenDirectory, `${name}.features.json`),
      serializeCanonical(analyzeGrammar(strippedIR)),
    );
    await writeFile(
      resolve(goldenDirectory, `${name}.features-loc.json`),
      serializeCanonical(analyzeGrammar(result.ir)),
    );
  }

  const bnfFixtureDirectory = resolve("packages/frontend-bnf/fixtures");
  const bnfGoldenDirectory = resolve(bnfFixtureDirectory, "golden");
  await mkdir(bnfGoldenDirectory, { recursive: true });
  const bnfContent = await readFile(resolve(bnfFixtureDirectory, "arithmetic.ebnf"), "utf8");
  const bnfResult = bnfFrontend.parse([{ name: "arithmetic.ebnf", content: bnfContent }], {});
  if (!bnfResult.ir) throw new Error("Could not generate IR for arithmetic.ebnf");
  await writeFile(
    resolve(bnfGoldenDirectory, "arithmetic.ir.json"),
    serializeCanonical(bnfResult.ir, { stripLocations: true }),
  );
  await writeFile(
    resolve(bnfGoldenDirectory, "arithmetic.ir-loc.json"),
    serializeCanonical(bnfResult.ir),
  );
  await writeFile(
    resolve(bnfGoldenDirectory, "arithmetic.features.json"),
    serializeCanonical(
      analyzeGrammar(JSON.parse(serializeCanonical(bnfResult.ir, { stripLocations: true }))),
    ),
  );
  await writeFile(
    resolve(bnfGoldenDirectory, "arithmetic.features-loc.json"),
    serializeCanonical(analyzeGrammar(bnfResult.ir)),
  );
}
