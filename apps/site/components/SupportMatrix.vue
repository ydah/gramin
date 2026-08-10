<script setup lang="ts">
interface FormatRow {
  readonly family: string;
  readonly frontend: string;
  readonly files: string;
  readonly strengths: string;
  readonly notes: string;
}

const rows: readonly FormatRow[] = [
  {
    family: "Yacc / Bison / Lrama",
    frontend: "yacc-family",
    files: "Single",
    strengths: "Precedence, actions, named references",
    notes: "Recovery can be lossy",
  },
  {
    family: "BNF / EBNF",
    frontend: "bnf",
    files: "Single",
    strengths: "Grouping, choice, repetition",
    notes: "First file only",
  },
  {
    family: "ANTLR4",
    frontend: "antlr4",
    files: "Multi-file",
    strengths: "Parser/lexer grammar, EBNF, imports",
    notes: "Target code is lossy",
  },
  {
    family: "Menhir",
    frontend: "menhir",
    files: "Single",
    strengths: "Classic rules, inline, parameterized symbols",
    notes: "Some attributes are unsupported",
  },
  {
    family: "Peggy / PEG.js",
    frontend: "peggy",
    files: "Single",
    strengths: "Ordered choice, predicates, scannerless",
    notes: "Actions are not retained",
  },
];
</script>

<template>
  <div class="metric-table-wrap">
    <table>
      <thead>
        <tr><th>Format family</th><th>Frontend ID</th><th>Files</th><th>Main strengths</th><th>Important boundary</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.frontend">
          <td>{{ row.family }}</td>
          <td><code>{{ row.frontend }}</code></td>
          <td>{{ row.files }}</td>
          <td>{{ row.strengths }}</td>
          <td>{{ row.notes }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
