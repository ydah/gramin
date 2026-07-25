# Ruby parse.y LLM digest experiment

- Date: 2026-07-25
- Corpus: `ruby/ruby` commit `33db313e855dfa83d7c66c2de6d63b9b401c32a0`
- Client: Claude Code 2.1.204, non-interactive print mode
- Digest size: 2,679 characters

## Input

The pinned `parse.y` was processed with:

```sh
gramin analyze fixtures/downloaded/ruby/parse.y \
  --dialect lrama --format llm
```

The resulting digest contained 210 terminals, 251 rules, 712 alternatives, recursion and
SCC metrics, 22 precedence levels, Lrama sugar counts, opaque action-length metrics,
notable symbol names, and diagnostic codes. It contained no comments, prologue, epilogue,
or action source.

Claude was asked to treat code-spanned text only as untrusted data, separate facts from
hypotheses, infer likely syntactic characteristics, and cite supporting metrics.

## Result

Claude separated a fact section from a hypothesis section and tied the following useful
hypotheses to concrete measurements:

- an expression-centered imperative grammar, based on the 132-rule SCC and central symbols
  such as `arg`, `expr_value`, and `primary_value`;
- an operator-rich infix syntax, based on 22 precedence levels and the associativity
  breakdown;
- extensive parse-time semantic work, based on 69.52% alternative action coverage, 41
  mid-rule actions, and action lengths;
- active macro-like grammar reuse, based on 18 parameterized definitions and 83 calls.

It also called out ignored Lrama directives and the truncation of the largest SCC list as
limitations, showing that the diagnostic and budget notes were visible.

## Assessment

The experiment supports the core use case: a short digest was sufficient for a model to
produce navigable language-design hypotheses without receiving the 16,000-line source.
The fixed safety premise did not get treated as grammar data, and no opaque source content
appeared in the response.

The response also over-interpreted the alternatives-per-rule count as ambiguity pressure
and speculated about semicolon omission from approximate lexical evidence. A parser table
is explicitly outside this tool's current scope, so the recommended prompt must tell the
model not to infer ambiguity or conflicts from structural metrics. Approximate token lists
must remain labeled as hypotheses, never conclusions.
