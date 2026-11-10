import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { runIsolated } from "./executor.js";
import { MCP_LIMITS, TOOL_DEFINITIONS } from "./tools.js";

export const MCP_VERSION = "0.4.0";

export const createMcpServer = (): McpServer => {
  const server = new McpServer(
    { name: "@gramin/mcp", version: MCP_VERSION },
    { maxToolInputElements: MCP_LIMITS.elements },
  );
  let busy = false;
  for (const { name, description, annotations, inputSchema } of TOOL_DEFINITIONS) {
    server.registerTool(
      name,
      {
        ...(description === undefined ? {} : { description }),
        ...(annotations === undefined ? {} : { annotations }),
        inputSchema: fromJsonSchema(inputSchema),
      },
      async (input, context) => {
        if (busy)
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "one grammar request is already running; retry after it finishes",
              },
            ],
          };
        busy = true;
        try {
          return {
            content: [
              {
                type: "text",
                text: await runIsolated(name, input, { signal: context.mcpReq.signal }),
              },
            ],
          };
        } catch (error: unknown) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : "grammar measurement failed",
              },
            ],
          };
        } finally {
          busy = false;
        }
      },
    );
  }
  return server;
};

export const serveStdio = async (): Promise<void> => {
  const server = createMcpServer();
  server.server.onerror = () => process.stderr.write("gramin MCP protocol error\n");
  await server.connect(
    new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 4 * 1024 * 1024 }),
  );
};
