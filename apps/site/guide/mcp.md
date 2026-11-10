# MCP server

`@gramin/mcp` supplies `analyze`, `diff`, `ir`, and `digest` tools over standard input
and output. Configure an MCP client to run:

```json
{
  "mcpServers": {
    "gramin": { "command": "npx", "args": ["--yes", "@gramin/mcp"] }
  }
}
```

Provide grammar names and content directly. The server uses bundled frontends and
keeps source actions and predicates opaque. Requests run in terminable workers
with input, output, deadline, heap, and sampled memory-growth guards. These guards
are not an operating-system sandbox.

See the [tool schemas and limits](https://github.com/ydah/gramin/blob/main/docs/mcp.md).
