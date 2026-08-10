<script setup lang="ts">
const grammar = `value
  : object
  | array
  | STRING
  | NUMBER
  ;

object
  : '{' members? '}'
  ;`;

const metrics = [
  ["Rules", "7"],
  ["Alternatives", "17"],
  ["Recursive rules", "6"],
  ["Unresolved symbols", "0"],
] as const;
</script>

<template>
  <div class="hero-demo" aria-label="Example grammar analysis">
    <div class="hero-demo__source">
      <div class="hero-demo__label">grammar.y</div>
      <pre><code>{{ grammar }}</code></pre>
    </div>
    <div class="hero-demo__result">
      <div class="hero-demo__label">deterministic features</div>
      <div class="hero-demo__metrics">
        <div v-for="[label, value] in metrics" :key="label" class="hero-demo__metric">
          <strong>{{ value }}</strong>
          <span>{{ label }}</span>
        </div>
      </div>
      <div class="hero-demo__status"><span aria-hidden="true">●</span> semantic actions not executed</div>
    </div>
  </div>
</template>

<style scoped>
.hero-demo {
  background: #172522;
  border: 1px solid rgba(11, 107, 102, 0.25);
  border-radius: 1rem;
  box-shadow: 0 22px 60px rgba(23, 37, 34, 0.14);
  color: #e8f0e9;
  display: grid;
  font-family: var(--vp-font-family-mono);
  gap: 1px;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  overflow: hidden;
  text-align: left;
}

.hero-demo__source,
.hero-demo__result {
  padding: 1.1rem;
}

.hero-demo__result {
  background: #1c302d;
}

.hero-demo__label {
  color: #9bbab0;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  margin-bottom: 0.8rem;
  text-transform: uppercase;
}

pre {
  font-size: 0.78rem;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.hero-demo__metrics {
  display: grid;
  gap: 0.55rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.hero-demo__metric {
  background: rgba(245, 242, 234, 0.08);
  border-radius: 0.6rem;
  padding: 0.7rem;
}

.hero-demo__metric strong {
  display: block;
  font-family: var(--vp-font-family-base);
  font-size: 1.35rem;
}

.hero-demo__metric span {
  color: #b9cdc4;
  display: block;
  font-family: var(--vp-font-family-base);
  font-size: 0.7rem;
  margin-top: 0.2rem;
}

.hero-demo__status {
  color: #b9cdc4;
  font-family: var(--vp-font-family-base);
  font-size: 0.72rem;
  margin-top: 1rem;
}

.hero-demo__status span {
  color: #d46f3e;
  margin-right: 0.35rem;
}

@media (max-width: 640px) {
  .hero-demo {
    grid-template-columns: 1fr;
  }
}
</style>
