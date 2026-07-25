import { type GrammarFeatures, serializeCanonical } from "@gramin/core";

export const renderJson = (features: GrammarFeatures): string => serializeCanonical(features);
