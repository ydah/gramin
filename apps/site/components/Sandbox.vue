<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { frontendOptions } from "../sandbox/frontend-registry";
import { BROWSER_WORKER_TIMEOUT_MS, MAX_BROWSER_INPUT_CHARS } from "../sandbox/limits";
import { defaultSample, sandboxSamples } from "../sandbox/samples";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeSuccess,
  SandboxMode,
} from "../sandbox/types";

const mode = ref<SandboxMode>("source");
const sampleId = ref(defaultSample?.id ?? "json-yacc");
const frontendId = ref(defaultSample?.frontendId ?? "auto");
const fileName = ref(defaultSample?.files[0]?.name ?? "grammar.y");
const source = ref(defaultSample?.files[0]?.content ?? "");
const beforeFileName = ref(defaultSample?.files[0]?.name ?? "before.y");
const beforeSource = ref(defaultSample?.files[0]?.content ?? "");
const afterFileName = ref(defaultSample?.files[0]?.name ?? "after.y");
const afterSource = ref(defaultSample?.files[0]?.content ?? "");
const budgetChars = ref(6000);
const activeTab = ref("summary");
const pending = ref(false);
const error = ref("");
const copyStatus = ref("");
const result = ref<AnalyzeSuccess>();
let worker: Worker | undefined;
let workerTimer: ReturnType<typeof setTimeout> | undefined;

const tabs = [
  ["summary", "Summary"],
  ["diagnostics", "Diagnostics"],
  ["features", "Features"],
  ["ir", "Grammar IR"],
  ["markdown", "Markdown"],
  ["llm", "LLM digest"],
  ["sarif", "SARIF"],
  ["diff", "Feature diff"],
  ["cli", "CLI command"],
] as const;

const currentSample = computed(() => sandboxSamples.find((sample) => sample.id === sampleId.value));
const diagnostics = computed(() => result.value?.features.diagnostics ?? []);
const output = computed(() => {
  const current = result.value;
  if (!current) return "";
  if (activeTab.value === "features") return current.reports.json;
  if (activeTab.value === "ir") return current.reports.ir;
  if (activeTab.value === "markdown") return current.reports.markdown;
  if (activeTab.value === "llm") return current.reports.llm;
  if (activeTab.value === "sarif") return current.reports.sarif;
  if (activeTab.value === "diff") return current.comparison?.reports.markdown ?? "";
  return "";
});

const setSample = (): void => {
  const sample = currentSample.value;
  if (!sample) return;
  mode.value = "source";
  frontendId.value = sample.frontendId;
  fileName.value = sample.files[0]?.name ?? "grammar.y";
  source.value = sample.files[0]?.content ?? "";
  beforeFileName.value = sample.files[0]?.name ?? "before.y";
  beforeSource.value = sample.files[0]?.content ?? "";
  afterFileName.value = sample.files[0]?.name ?? "after.y";
  afterSource.value = sample.files[0]?.content ?? "";
  result.value = undefined;
  error.value = "";
  activeTab.value = "summary";
};

const requestFor = (): AnalyzeRequest => {
  if (mode.value === "compare") {
    return {
      mode: mode.value,
      files: [],
      beforeFiles: [{ name: beforeFileName.value, content: beforeSource.value }],
      afterFiles: [{ name: afterFileName.value, content: afterSource.value }],
      frontendId: frontendId.value,
      budgetChars: budgetChars.value,
    };
  }
  return {
    mode: mode.value,
    files: [{ name: mode.value === "ir" ? "input.json" : fileName.value, content: source.value }],
    frontendId: mode.value === "ir" ? "auto" : frontendId.value,
    budgetChars: budgetChars.value,
  };
};

const analyze = (): void => {
  pending.value = true;
  error.value = "";
  copyStatus.value = "";
  result.value = undefined;
  worker?.terminate();
  if (workerTimer) clearTimeout(workerTimer);
  worker = new Worker(new URL("../sandbox/worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<AnalyzeResponse>) => {
    if (workerTimer) clearTimeout(workerTimer);
    pending.value = false;
    const response = event.data;
    if (response.ok) {
      result.value = response;
      activeTab.value = "summary";
    } else {
      error.value = response.message;
    }
    worker?.terminate();
    worker = undefined;
  };
  worker.onerror = (event) => {
    if (workerTimer) clearTimeout(workerTimer);
    pending.value = false;
    error.value = event.message || "The browser worker failed.";
    worker?.terminate();
    worker = undefined;
  };
  worker.postMessage(requestFor());
  workerTimer = setTimeout(() => {
    pending.value = false;
    error.value = "The browser worker exceeded the 10 second limit and was stopped.";
    worker?.terminate();
    worker = undefined;
  }, BROWSER_WORKER_TIMEOUT_MS);
};

const copy = async (text: string): Promise<void> => {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      if (!document.execCommand("copy")) throw new Error("copy command failed");
      textarea.remove();
    }
    copyStatus.value = "Copied to clipboard.";
  } catch {
    copyStatus.value = "Copy is unavailable here. Select the output manually.";
  }
};

const download = (name: string, content: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

const cliCommand = computed(() => {
  const frontend = result.value?.frontend.id ?? frontendId.value;
  if (mode.value === "compare") {
    return `npx @gramin/cli diff ${beforeFileName.value} ${afterFileName.value} --frontend ${frontend} --format md`;
  }
  const format = activeTab.value === "markdown" ? "md" : "json";
  return `npx @gramin/cli analyze ${fileName.value} --frontend ${frontend} --format ${format}`;
});

onBeforeUnmount(() => {
  if (workerTimer) clearTimeout(workerTimer);
  worker?.terminate();
});
</script>

<template>
  <section class="sandbox-shell" aria-label="Gramin browser sandbox">
    <div class="sandbox-toolbar">
      <label>
        <span>Mode</span>
        <select v-model="mode" aria-label="Analysis mode">
          <option value="source">Analyze source</option>
          <option value="ir">Analyze Grammar IR</option>
          <option value="compare">Compare before / after</option>
        </select>
      </label>
      <label v-if="mode !== 'ir'">
        <span>Sample</span>
        <select v-model="sampleId" aria-label="Sample" @change="setSample">
          <option v-for="sample in sandboxSamples" :key="sample.id" :value="sample.id">{{ sample.label }}</option>
        </select>
      </label>
      <label v-if="mode !== 'ir'">
        <span>Frontend</span>
        <select v-model="frontendId" aria-label="Frontend">
          <option v-for="option in frontendOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </label>
      <label>
        <span>Digest chars</span>
        <input v-model.number="budgetChars" type="number" min="1000" max="24000" step="500" aria-label="LLM digest character budget" />
      </label>
      <button type="button" :disabled="pending" @click="analyze">{{ pending ? "Analyzing…" : "Analyze" }}</button>
    </div>

    <div class="sandbox-grid">
      <div class="sandbox-pane">
        <div class="sandbox-toolbar" style="padding: 0 0 0.8rem; background: transparent">
          <label v-if="mode === 'source'">
            <span>Source name</span>
            <input v-model="fileName" aria-label="Source name" />
          </label>
          <template v-else-if="mode === 'compare'">
            <label>
              <span>Before</span>
              <input v-model="beforeFileName" aria-label="Before source name" />
            </label>
            <label>
              <span>After</span>
              <input v-model="afterFileName" aria-label="After source name" />
            </label>
          </template>
          <span v-else class="section-kicker">IR JSON input</span>
        </div>
        <textarea
          v-if="mode !== 'compare'"
          v-model="source"
          class="sandbox-editor"
          spellcheck="false"
          aria-label="Grammar source"
        />
        <div v-else class="sandbox-compare-editors">
          <label>
            <span>Before</span>
            <textarea v-model="beforeSource" class="sandbox-editor" spellcheck="false" aria-label="Before grammar source" />
          </label>
          <label>
            <span>After</span>
            <textarea v-model="afterSource" class="sandbox-editor" spellcheck="false" aria-label="After grammar source" />
          </label>
        </div>
        <p class="sandbox-note">Runs locally in this browser. Semantic actions and external frontends are never executed. Input limit: {{ MAX_BROWSER_INPUT_CHARS.toLocaleString() }} characters.</p>
      </div>

      <div class="sandbox-pane sandbox-result">
        <div v-if="result" class="sandbox-tabs" role="tablist" aria-label="Analysis outputs">
          <template v-for="[id, label] in tabs" :key="id">
            <button v-if="id !== 'diff' || result.comparison" type="button" :class="{ active: activeTab === id }" role="tab" :aria-selected="activeTab === id" @click="activeTab = id">{{ label }}</button>
          </template>
        </div>
        <div v-if="error" class="sandbox-error" role="alert">{{ error }}</div>
        <template v-if="result && activeTab === 'summary'">
          <p class="section-kicker">{{ result.frontend.id }} · {{ result.elapsedMilliseconds }}ms</p>
          <div class="sandbox-stat-grid">
            <div class="sandbox-stat"><strong>{{ result.features.size.rules }}</strong><span>Rules</span></div>
            <div class="sandbox-stat"><strong>{{ result.features.size.alternatives }}</strong><span>Alternatives</span></div>
            <div class="sandbox-stat"><strong>{{ result.features.structure.recursiveRules.count }}</strong><span>Recursive rules</span></div>
            <div class="sandbox-stat"><strong>{{ result.features.size.unresolvedSymbols.count }}</strong><span>Unresolved symbols</span></div>
            <div class="sandbox-stat"><strong>{{ result.features.structure.unreachableSymbols.length }}</strong><span>Unreachable rules</span></div>
            <div class="sandbox-stat"><strong>{{ result.features.structure.maxDependencyDepth }}</strong><span>Max dependency depth</span></div>
            <div v-if="result.comparison" class="sandbox-stat"><strong>{{ result.comparison.diff.regressions.length }}</strong><span>Tracked regressions</span></div>
            <div v-if="result.comparison" class="sandbox-stat"><strong>{{ result.comparison.diff.changes.length }}</strong><span>Feature changes</span></div>
          </div>
          <div class="format-chips" aria-label="Grammar capabilities">
            <span v-if="result.features.capabilities.orderedChoice" class="format-chip">Ordered choice</span>
            <span v-if="result.features.capabilities.scannerless" class="format-chip">Scannerless</span>
            <span v-if="result.features.capabilities.ebnfSugar" class="format-chip">EBNF sugar</span>
            <span v-if="result.features.capabilities.lexerRules" class="format-chip">Lexer rules</span>
            <span v-if="result.features.capabilities.parameterizedRules" class="format-chip">Parameterized rules</span>
          </div>
          <p class="sandbox-note">Metrics are structural facts, not a semantic quality score. See the comparability guide before comparing formats.</p>
        </template>
        <template v-else-if="result && activeTab === 'diagnostics'">
          <h3>Diagnostics</h3>
          <p v-if="diagnostics.length === 0" class="sandbox-note">No diagnostics were emitted.</p>
          <ul v-else class="diagnostics-list">
            <li v-for="diagnostic in diagnostics" :key="`${diagnostic.code}-${diagnostic.message}`">
              <strong>{{ diagnostic.severity }}</strong> <code>{{ diagnostic.code }}</code>
              <span>{{ diagnostic.message }}</span>
            </li>
          </ul>
        </template>
        <template v-else-if="result && activeTab === 'diff' && result.comparison">
          <h3>Feature diff</h3>
          <p class="sandbox-note">A tracked regression is a configured review policy signal, not a claim that the grammar is semantically worse.</p>
          <div class="sandbox-stat-grid">
            <div class="sandbox-stat"><strong>{{ result.comparison.diff.regressions.length }}</strong><span>Tracked regressions</span></div>
            <div class="sandbox-stat"><strong>{{ result.comparison.diff.changes.length }}</strong><span>All changes</span></div>
          </div>
          <div class="sandbox-output">{{ output }}</div>
          <div class="sandbox-actions">
            <button type="button" @click="copy(output)">Copy</button>
            <button type="button" @click="download('feature-diff.md', output)">Download</button>
          </div>
        </template>
        <template v-else-if="result && activeTab === 'cli'">
          <h3>Equivalent CLI command</h3>
          <pre class="sandbox-output">{{ cliCommand }}</pre>
          <button type="button" @click="copy(cliCommand)">Copy command</button>
        </template>
        <template v-else-if="result">
          <div class="sandbox-output">{{ output }}</div>
          <div class="sandbox-actions">
            <button type="button" @click="copy(output)">Copy</button>
            <button type="button" @click="download(`${activeTab}.txt`, output)">Download</button>
          </div>
        </template>
        <p v-else class="sandbox-note">Choose a sample or paste a grammar, then select Analyze.</p>
        <p v-if="copyStatus" class="sandbox-copy-status" aria-live="polite">{{ copyStatus }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sandbox-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

.sandbox-tabs button,
.sandbox-actions button,
.sandbox-result > button {
  background: transparent;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.45rem;
  color: var(--vp-c-text-2);
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  padding: 0.4rem 0.58rem;
}

.sandbox-tabs button.active {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.sandbox-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.7rem;
}

.diagnostics-list {
  display: grid;
  gap: 0.7rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.diagnostics-list li {
  background: var(--vp-c-bg-alt);
  border-radius: 0.6rem;
  display: grid;
  font-size: 0.8rem;
  gap: 0.25rem;
  padding: 0.7rem;
}

.diagnostics-list strong {
  color: var(--vp-c-brand-3);
  text-transform: capitalize;
}
</style>
