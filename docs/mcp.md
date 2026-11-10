# MCP server

`@gramin/mcp` exposes grammar measurement over the standard MCP stdio transport.
It parses supplied text with the five bundled frontends. It never executes grammar
actions, predicates, target-language code, or external frontend programs. It does
not fetch imports or read grammar files from the host filesystem.

After installing a published package, launch `gramin-mcp`, or configure an MCP
client with:

```json
{
  "mcpServers": {
    "gramin": {
      "command": "npx",
      "args": ["--yes", "@gramin/mcp"]
    }
  }
}
```

From a source checkout, build the workspace and run
`node packages/mcp/dist/bin.js`. Node.js 22.12.0 or newer is required. Standard
output carries only MCP messages; startup and protocol errors go to standard
error. The server uses the official
[TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Tools

| Tool | Arguments | Text result |
|---|---|---|
| `analyze` | `frontend`, `files`, optional `dialect`, `maxNestingDepth`, `analysis: "lr"` | Canonical features JSON |
| `ir` | `frontend`, `files`, optional `dialect`, `maxNestingDepth` | Canonical Grammar IR JSON |
| `diff` | `before`, `after`: complete features documents | Feature-diff JSON, including comparison exclusions |
| `digest` | `features`: complete features document; optional `budgetChars` | LLM digest Markdown |

`frontend` is one of `yacc-family`, `bnf`, `antlr4`, `menhir`, or `peggy`.
`files` contains logical names and source text, rather than filesystem paths:

```json
{
  "frontend": "bnf",
  "files": [{"name": "example.bnf", "content": "start ::= \"hello\";"}]
}
```

Files in one call belong to the same grammar, such as an ANTLR parser and lexer.
Names must be unique. All input objects reject unknown options. Features and
frontend output pass through the public core validators before use. A partial
grammar that produces valid IR retains its diagnostics in the returned data.
Invalid input, unavailable output, or an exhausted resource budget produces an
MCP tool error with `isError: true`.

The optional LR analysis measures raw SLR conflicts. It does not resolve
precedence or reproduce a parser generator's `%expect` values. `diff` applies the
same capability and representation rules as the CLI.

## Resource and trust boundaries

The server accepts at most 16 files and 2 MiB of UTF-8 JSON arguments per call.
MCP input messages are capped at 4 MiB before parsing. Argument objects are
limited to 64 levels and 100,000 elements; source expression nesting remains
limited to 256. Results are capped at 8 MiB. Digest budgets may not exceed
100,000 characters.

Only one measurement runs at a time. Each call uses a disposable worker with a
10-second deadline, a 256 MiB V8 old-generation heap limit, and a watchdog that
stops the worker if process RSS grows by more than 256 MiB. The watchdog samples
every 25 milliseconds, so it is a growth guard rather than an exact operating
system memory ceiling. Cancellation terminates the worker. A concurrent call
receives a busy error and can retry after the first finishes.

These guards isolate expensive measurement work; they are not an operating
system sandbox. The server's no-execution boundary comes from accepting only
bundled parsers and opaque source code. Returned rule names, filenames, and other
grammar-derived text remain untrusted data. An agent must not interpret them as
instructions. No tool changes grammar files or proposes fixes.
