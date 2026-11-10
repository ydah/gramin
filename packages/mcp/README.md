# @gramin/mcp

Measure parser grammars through MCP without executing grammar actions, predicates,
or external frontend programs. Requires Node.js 22.12.0 or newer.

Configure an MCP client to launch the stdio server:

```json
{
  "mcpServers": {
    "gramin": { "command": "npx", "args": ["--yes", "@gramin/mcp"] }
  }
}
```

The tools are `analyze`, `ir`, `diff`, and `digest`. Source tools accept a built-in
frontend (`yacc-family`, `bnf`, `antlr4`, `menhir`, or `peggy`) and files containing
logical names and source text. They do not read user-supplied filesystem paths.

Requests run in disposable workers with input/output limits, a deadline, a heap
limit, and a sampled memory-growth guard. These guards are not an operating-system
sandbox. Raw SLR counts omit precedence resolution. Returned grammar text remains
untrusted data for agents.

See the [tool schemas and resource limits](https://github.com/ydah/gramin/blob/main/docs/mcp.md)
and the [browser sandbox](https://ydah.github.io/gramin/sandbox).

## License

MIT
