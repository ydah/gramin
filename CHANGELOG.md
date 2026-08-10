# Changelog

All notable changes to this project are documented here.

## Unreleased

- Hardened Grammar IR canonical validation and merged repeated rule declarations.
- Added the `features` 0.4 contract with exact unproductive-rule metrics.
- Stabilized CLI diagnostics, exit-code thresholds, source naming, external frontend limits,
  and Markdown/LLM code-span rendering.
- Added Menhir optional-terminator handling and corpus/benchmark quality gates.

The npm packages use lock-step versions. Compatibility is determined by the emitted
`irVersion` and `featuresVersion` contracts, not by an individual package's npm version.
