---
layout: home
title: Gramin — Structural analysis for parser grammars
titleTemplate: false
description: Turn grammar files into facts you can review.
hero:
  name: Gramin
  text: Turn grammar files into facts you can review.
  tagline: Common, versioned Grammar IR and deterministic structural features for parser grammars — without executing semantic actions.
  actions:
    - theme: brand
      text: Try the sandbox
      link: /sandbox
    - theme: alt
      text: Get started
      link: /guide/getting-started
features:
  - title: Common, versioned IR
    details: Normalize Yacc, BNF, ANTLR4, Menhir, and PEG grammars at a JSON-Schema-backed boundary.
  - title: Deterministic facts
    details: Count rules, dependencies, recursion, reachability, and more using stable definitions.
  - title: Review-ready reports
    details: Produce JSON, Markdown, LLM digests, SARIF, and feature diffs from one analysis result.
---

<HeroDemo />

<section class="home-section home-section-tight">
  <div class="section-kicker">The path from source to review</div>
  <h2>Understand a grammar before you change it.</h2>
  <p class="section-lede">Gramin separates format-specific parsing from format-independent analysis, so the same contract powers exploration, review, CI, and custom tooling.</p>
  <div class="pipeline-strip" aria-label="Gramin analysis pipeline">
    <span>Grammar source</span><b>→</b><span>Frontend</span><b>→</b><span>Grammar IR v1</span><b>→</b><span>Features</span><b>→</b><span>JSON · Markdown · SARIF</span>
  </div>
</section>

<section class="home-section">
  <div class="section-kicker">Why Gramin</div>
  <div class="home-card-grid">
    <article class="home-card"><h3>Explore</h3><p>Find large rules, recursion, unresolved symbols, unreachable rules, and the diagnostics that deserve attention.</p><a href="./guide/how-it-works">Understand the analysis →</a></article>
    <article class="home-card"><h3>Review</h3><p>Compare before and after features without pretending that every metric is comparable across representations.</p><a href="./concepts/comparability">Learn about metric classes →</a></article>
    <article class="home-card"><h3>Automate</h3><p>Use a baseline, regression policy, and SARIF output to bring structural review into GitHub Actions.</p><a href="./guide/github-actions">Add it to CI →</a></article>
    <article class="home-card"><h3>Build</h3><p>Use the IR schema and external frontend protocol as a stable boundary for your own grammar tooling.</p><a href="./reference/frontend-protocol">Connect a frontend →</a></article>
  </div>
</section>

<section class="home-section">
  <div class="section-kicker">Supported formats</div>
  <h2>Many syntaxes, one analysis boundary.</h2>
  <p class="section-lede">Support is intentionally format-aware. See the matrix for dialects, capabilities, and lossy cases before interpreting a result.</p>
  <SupportMatrix />
  <p class="home-section-link"><a href="./formats/">View the complete support matrix →</a></p>
</section>

<section class="home-section">
  <div class="section-kicker">Same language, different representation</div>
  <h2>Numbers need context.</h2>
  <p class="section-lede">The same JSON language can have different structural measurements when written in Yacc, ANTLR4, or Peggy. Gramin makes that context visible instead of hiding it behind one complexity score.</p>
  <MetricTable />
  <p class="home-section-link"><a href="./concepts/comparability">Learn how cross-format comparison works →</a></p>
</section>

<section class="home-section home-safety">
  <div>
    <div class="section-kicker">Trust boundaries</div>
    <h2>Structure only. No execution.</h2>
    <p>Browser sandbox analysis stays local. Semantic actions and target code are never executed or retained as IR. Unsupported or lossy syntax is reported as diagnostics, and not-applicable metrics are not shown as fake zeroes.</p>
  </div>
  <a class="vp-button brand" href="./concepts/safety">Read the safety model</a>
</section>

<section class="home-section home-faq">
  <div class="section-kicker">FAQ</div>
  <h2>What Gramin does — and does not do.</h2>
  <details><summary>Does Gramin generate parsers?</summary><p>No. It analyzes grammar structure; it does not generate a parser or prove language-level correctness.</p></details>
  <details><summary>Can I compare different grammar formats?</summary><p>Yes, with context. Class A metrics are designed for cross-format comparison, while Class B and C metrics require capability or representation context.</p></details>
  <details><summary>Does the sandbox upload my grammar?</summary><p>No. The browser sandbox runs the parser frontend and analyzer in a Web Worker without sending grammar contents to a server.</p></details>
  <details><summary>Can I send the LLM digest directly to an AI service?</summary><p>The sandbox only creates a bounded, copyable digest. It does not call an LLM service or send your grammar anywhere.</p></details>
</section>
