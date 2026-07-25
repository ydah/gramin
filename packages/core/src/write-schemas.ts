import { mkdir, writeFile } from "node:fs/promises";
import { serializeCanonical } from "./serialization.js";
import { GrammarFeaturesSchemaDocument, GrammarIRSchemaDocument } from "./schema-documents.js";

const schemaDirectory = new URL("../schema/", import.meta.url);

await mkdir(schemaDirectory, { recursive: true });
await Promise.all([
  writeFile(
    new URL("grammar-ir-v0.2.schema.json", schemaDirectory),
    serializeCanonical(GrammarIRSchemaDocument),
  ),
  writeFile(
    new URL("features-v0.2.schema.json", schemaDirectory),
    serializeCanonical(GrammarFeaturesSchemaDocument),
  ),
]);
