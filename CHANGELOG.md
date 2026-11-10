# Changelog

## 1.0.0 — 2026-11-10

- Stabilize the CLI, public package APIs, and features v1 under the documented
  compatibility policy. Preserve historical feature schemas and Grammar IR v1.
- Add a source SCC-size histogram and show component frequencies in the sandbox.
- Publish the external frontend template and starter issues for contributors.

## 0.4.0 — 2026-11-10

- Compare rule vectors by name, with explicit reasons when versions, capabilities,
  or measurement domains prevent a numeric comparison.
- Export CSV and analyze multiple independent grammars in one command.
- Measure merge-base baselines in the Action, update PR comments, and write job
  summaries. Add frontend, dialect, source-root, and analysis inputs.
- Provide `@gramin/mcp` tools for analysis, IR, differences, and digests, with
  isolated requests and resource guards.
- Visualize measured distributions and rule vectors in the browser sandbox and
  compare inputs from different frontends using the same comparison gates.
- Publish a reproducible Grammar Atlas and Ruby parse.y history with JSON/CSV,
  source provenance, and weekly measurements of pinned inputs.
- Check external frontend contracts with `frontend-test`; provide a Python starter,
  frontend directory, compatibility policy, and security reporting guidance.
- Verify registry identity and tarball integrity after publication, including a
  bounded wait for registry propagation.

- Measure FIRST/FOLLOW, LL(1), and raw SLR on bounded, deterministic expansions of
  locally defined parameterized rules. Preserve source size and structure metrics
  and record the concrete measurement domain.
- Add rule-level SLR conflict involvement and its distribution, nullable repetition
  counts, indirect left recursion, and captured global conflict expectations.
- Preserve overloaded Lrama template definitions and their source documentation.
- Reuse LR kernels and calculate FIRST/FOLLOW with bitsets. Fixed Ruby, PHP, and
  Perl corpora are checked with LR analysis enabled.
- Publish features schema 0.8 and Grammar IR 1.4. Historical schema artifacts remain
  available. Add generated-IR invariant checks and a catalog-to-test coverage gate.

## 0.2.1 — 2026-11-10

- Configure Node.js explicitly in the GitHub Action and use an existing versioned
  Action reference in examples.
- Recognize Lrama lifecycle hooks while keeping their code opaque.
- Explain that raw SLR counts omit precedence resolution and cannot be compared to
  `%expect` declarations.
- Correct the documented Node.js requirement and nesting limits; check these facts
  in CI.
- Add an aligned JSON corpus in five formats, metric invariants, contributing
  guidance, and a metric RFC template.

## 0.2.0

- Analyze Yacc/Bison/Lrama, BNF/EBNF, ANTLR4, Menhir, and Peggy grammars through a
  common, validated Grammar IR.
- Export deterministic JSON, Markdown, LLM digests, and SARIF. Include rule vectors,
  contextual metrics, source-backed facts, and structural grammar differences.
- Provide a browser sandbox, GitHub Action, external frontend protocol, and
  integrity-checked corpus benchmarks.
- Harden canonical validation, expression-depth limits, cross-platform releases,
  and handling of unsupported or lossy constructs.

[Compare 0.2.0 to 0.2.1](https://github.com/ydah/gramin/compare/v0.2.0...v0.2.1).
