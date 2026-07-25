import { GrammarFeaturesSchema } from "./schemas/features.js";
import { GrammarIRSchema } from "./schemas/ir.js";

const draft202012 = "https://json-schema.org/draft/2020-12/schema";

export interface SchemaDocument {
  readonly $schema: string;
  readonly [key: string]: unknown;
}

export const GrammarIRSchemaDocument: SchemaDocument = {
  $schema: draft202012,
  ...GrammarIRSchema,
};

export const GrammarFeaturesSchemaDocument: SchemaDocument = {
  $schema: draft202012,
  ...GrammarFeaturesSchema,
};
