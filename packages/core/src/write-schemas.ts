import { mkdir, writeFile } from "node:fs/promises";
import { GrammarFeaturesSchemaDocument, GrammarIRSchemaDocument } from "./schema-documents.js";
import { serializeCanonical } from "./serialization.js";

const schemaDirectory = new URL("../schema/", import.meta.url);

await mkdir(schemaDirectory, { recursive: true });
await Promise.all([
  writeFile(
    new URL("grammar-ir-v1.schema.json", schemaDirectory),
    serializeCanonical(GrammarIRSchemaDocument),
  ),
  writeFile(
    new URL("features-v0.3.schema.json", schemaDirectory),
    serializeCanonical(GrammarFeaturesSchemaDocument),
  ),
]);
