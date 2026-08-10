<script setup lang="ts">
interface MetricRow {
  readonly metric: string;
  readonly classification: "A" | "B" | "C";
  readonly yacc: string;
  readonly antlr: string;
  readonly peggy: string;
}

const rows: readonly MetricRow[] = [
  { metric: "Rules", classification: "A", yacc: "7", antlr: "5", peggy: "10" },
  { metric: "Alternatives", classification: "A", yacc: "17", antlr: "11", peggy: "16" },
  { metric: "Reachable rules", classification: "A", yacc: "7", antlr: "5", peggy: "8" },
  { metric: "Recursive rules", classification: "B", yacc: "6", antlr: "4", peggy: "4" },
  { metric: "Nullable rules", classification: "B", yacc: "0", antlr: "0", peggy: "N/A" },
];
</script>

<template>
  <div class="metric-table-wrap">
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Class</th>
          <th>Yacc</th>
          <th>ANTLR4</th>
          <th>Peggy</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.metric">
          <td><code>{{ row.metric }}</code></td>
          <td><span :class="`metric-class metric-class--${row.classification.toLowerCase()}`">{{ row.classification }}</span></td>
          <td>{{ row.yacc }}</td>
          <td>{{ row.antlr }}</td>
          <td>{{ row.peggy }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
