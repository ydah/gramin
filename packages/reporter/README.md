# @gramin/reporter

Deterministic JSON, Markdown, and LLM-oriented reporting for gramin feature documents.

## Installation

```sh
npm install @gramin/reporter
```

The package exports `renderJson`, `renderMarkdown`, and `renderLlmDigest`. The LLM
renderer applies a fixed character budget and escapes source-derived symbols and
literals.

See the [LLM digest specification](https://github.com/ydah/gramin/blob/main/docs/llm-digest.md)
for the output contract and safe prompting guidance.

## License

MIT
