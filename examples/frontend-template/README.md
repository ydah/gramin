# gramin external frontend template

Build a grammar frontend in any language and let gramin measure its output through
the [Grammar IR contract](https://github.com/ydah/gramin/blob/main/docs/ir-schema.md).
This dependency-free Python starter demonstrates the process boundary with a tiny
literal-alternative notation:

```bnf
greeting ::= "hello" | "hi";
```

Each nonempty source line is one rule. Alternatives contain JSON string literals,
including escaped characters, Unicode, and the empty string. A line starting with
`#` is a comment. Symbol references, EBNF operators, and embedded actions are
unsupported and rejected. This is a protocol starter, not a general BNF frontend.

## Try the adapter

Python 3 is the only frontend runtime requirement. Install a gramin CLI release
containing `frontend-test`, or build gramin as shown in this repository's CI.

```sh
python3 -m unittest discover -s tests
./bin/gramin-example-frontend parse fixtures/sample.bnf
gramin frontend-test fixtures/sample.bnf --frontend-cmd ./bin/gramin-example-frontend
gramin analyze fixtures/sample.bnf --frontend-cmd ./bin/gramin-example-frontend
```

The conformance command validates schema, canonical form, and capability
declarations, then compares two canonical outputs for the same supplied fixture.
It samples the contract; add fixtures and hand-calculated assertions for the
syntax and semantics your frontend promises.

## Adapt it to your format

1. Replace `parse_grammar` with a parser for your format. Keep input files read-only
   and embedded actions and predicates opaque.
2. Change `source.format`, the frontend ID/version, and the executable name. Declare
   capabilities from the AST you emit, preserving all diagnostics for unsupported
   or lossy constructs.
3. Emit one canonical Grammar IR JSON document on stdout. Use stderr for process
   failures and keep successful JSON free of logs.
4. Add valid, invalid, unsupported, and boundary fixtures. Test emitted IR against
   the [frontend protocol](https://github.com/ydah/gramin/blob/main/docs/frontend-protocol.md)
   and run `frontend-test` for every supported dialect and fixture group.
5. Pin the gramin commit or released CLI used in CI. The included workflow builds
   gramin from `main` until a suitable released CLI is selected.

The adapter accepts `parse [--dialect NAME] FILE...` and `parse --stdin`. Multiple
paths form one grammar. Invalid invocation exits 3; unsupported syntax or an
unreadable file exits 2 without a partial JSON document. A frontend supporting
partial recovery should emit valid IR with error diagnostics and exit 1.

`--frontend-cmd` executes a program selected by the caller. Trust and isolate that
program as you would any local executable; conformance checks do not sandbox it
or prove it avoids executing source code.
