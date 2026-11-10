<script setup lang="ts">
import type { GrammarFeatures } from "@gramin/core";
import { computed, ref } from "vue";
import { featureCharts, ruleChartData, ruleMetrics, type RuleMetric } from "../sandbox/chart-data";

const props = defineProps<{ features: GrammarFeatures }>();
const metric = ref<RuleMetric>("alternatives");
const query = ref("");
const charts = computed(() =>
  featureCharts(props.features).map((chart) => ({
    ...chart,
    maximum: chart.rows.reduce((maximum, row) => Math.max(maximum, row.value ?? 0), 0),
  })),
);
const rules = computed(() => ruleChartData(props.features, metric.value, query.value));
const metricLabel = computed(() => ruleMetrics.find(([key]) => key === metric.value)?.[1]);
const width = (value: number, maximum: number): string =>
  `${maximum === 0 ? 0 : (value / maximum) * 100}%`;
</script>

<template>
  <div class="feature-charts">
    <p class="chart-introduction">p50 is the median; p95 is the 95th percentile. Every bar includes its measured value.</p>
    <section v-for="chart in charts" :key="chart.title" class="feature-chart" :aria-label="chart.title">
      <h3>{{ chart.title }}</h3>
      <p class="chart-description">{{ chart.description }}</p>
      <dl>
        <div v-for="row in chart.rows" :key="row.label" class="chart-row">
          <dt>{{ row.label }}</dt>
          <dd>
            <template v-if="row.value !== undefined">
              <strong>{{ row.value }}</strong>
              <span class="chart-track" aria-hidden="true"><span :style="{ width: width(row.value, chart.maximum) }" /></span>
            </template>
            <span v-else class="chart-unavailable">Unavailable: {{ row.reason }}</span>
          </dd>
        </div>
      </dl>
      <p v-if="chart.maximum > 0" class="chart-scale">Scale: 0–{{ chart.maximum }}</p>
    </section>

    <section class="feature-chart" aria-label="Rule vectors">
      <h3>Rule vectors</h3>
      <div class="chart-controls">
        <label>
          <span>Metric</span>
          <select v-model="metric">
            <option v-for="[key, label] in ruleMetrics" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
        <label>
          <span>Filter rule names</span>
          <input v-model="query" type="search" autocomplete="off" />
        </label>
      </div>
      <p v-if="features.parseability.context" class="chart-description">Source rule rows are shown below. FIRST, FOLLOW, and raw SLR values use the recorded concrete expansion; template rows may be unavailable.</p>
      <table v-if="rules.rows.length > 0" class="rule-chart">
        <caption>Showing {{ rules.rows.length }} of {{ rules.total }} matching rules, largest values first. Complete vectors are in Features.</caption>
        <thead><tr><th scope="col">Rule</th><th scope="col">{{ metricLabel }}</th></tr></thead>
        <tbody>
          <tr v-for="row in rules.rows" :key="row.rule">
            <th scope="row"><code>{{ row.rule }}</code></th>
            <td>
              <template v-if="row.value !== undefined">
                <strong>{{ row.value }}</strong>
                <span class="chart-track" aria-hidden="true"><span :style="{ width: width(row.value, rules.maximum) }" /></span>
              </template>
              <span v-else class="chart-unavailable">Unavailable: {{ row.reason }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="chart-description">No rule names match this filter.</p>
      <p v-if="rules.maximum > 0" class="chart-scale">Scale: 0–{{ rules.maximum }}</p>
    </section>
  </div>
</template>

<style scoped>
.feature-charts {
  --chart-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
  font-size: 0.85rem;
}

:global(.dark) .feature-charts {
  --chart-color: #75cfc0;
}

.chart-introduction,
.chart-description,
.chart-scale,
.rule-chart caption {
  color: var(--vp-c-text-2);
  font-size: 0.78rem;
  line-height: 1.5;
  margin: 0.4rem 0;
}

.feature-chart + .feature-chart {
  border-top: 1px solid var(--vp-c-divider);
  margin-top: 1.4rem;
  padding-top: 1rem;
}

.feature-chart h3 {
  font-size: 1rem;
  margin: 0;
}

.feature-chart dl {
  margin: 0.8rem 0 0;
}

.chart-row {
  align-items: center;
  display: grid;
  gap: 0.8rem;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  margin: 0.65rem 0;
}

.chart-row dt {
  font-size: 0.8rem;
}

.chart-row dd {
  margin: 0;
  min-width: 0;
}

.feature-charts strong {
  display: block;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.chart-track {
  background: var(--vp-c-bg-alt);
  display: block;
  height: 0.45rem;
  margin-top: 0.25rem;
  overflow: hidden;
}

.chart-track > span {
  background: var(--chart-color);
  display: block;
  height: 100%;
}

.chart-controls {
  display: grid;
  gap: 0.6rem;
  margin: 0.8rem 0;
}

.chart-controls label {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.chart-controls input,
.chart-controls select {
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.35rem;
  box-sizing: border-box;
  color: var(--vp-c-text-1);
  font: inherit;
  padding: 0.5rem;
  width: 100%;
}

.chart-controls :focus-visible {
  outline: 2px solid var(--chart-color);
  outline-offset: 2px;
}

.rule-chart {
  border-collapse: collapse;
  font-size: 0.78rem;
  table-layout: fixed;
  width: 100%;
}

.rule-chart caption {
  caption-side: top;
  text-align: left;
}

.rule-chart th,
.rule-chart td {
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 0.6rem 0.4rem;
  text-align: left;
  vertical-align: top;
  width: 50%;
}

.rule-chart code {
  color: var(--vp-c-text-1);
  overflow-wrap: anywhere;
}

.chart-unavailable {
  color: var(--vp-c-text-2);
  display: block;
  font-size: 0.75rem;
  line-height: 1.5;
}
</style>
