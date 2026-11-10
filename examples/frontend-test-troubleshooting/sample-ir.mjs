export const ir = {
  irVersion: "1.4.0",
  source: {
    format: "bnf",
    dialect: "bnf",
    fileNames: process.argv.slice(3),
    frontend: { id: "conformance-example", version: "1.0.0" },
  },
  capabilities: {
    ebnfSugar: false,
    lexerRules: false,
    orderedChoice: false,
    parameterizedRules: false,
    precedenceTable: false,
    predicates: false,
    scannerless: false,
  },
  startSymbols: ["start"],
  rules: [{ name: "start", alternatives: [{ items: [{ kind: "terminal", literal: "x" }] }] }],
  terminals: [{ literal: "x" }],
  externalSymbols: [],
  precedence: [],
  diagnostics: [],
};
