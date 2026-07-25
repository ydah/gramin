# Python external frontend example

`gramin-bnf-frontend` is a dependency-free reference implementation of the external
frontend protocol. It deliberately implements a small BNF/EBNF subset so the process
boundary and contract validation remain easy to inspect.

```sh
gramin analyze grammar.ebnf \
  --frontend-cmd ./examples/external-frontend-py/gramin-bnf-frontend
```

The executable was implemented from the checklist in
[`docs/frontend-protocol.md`](../../docs/frontend-protocol.md). It receives read-only
file paths, emits one Grammar IR JSON document on stdout, and uses the protocol exit
codes.
