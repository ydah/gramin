#!/usr/bin/env node
import { serveStdio } from "./server.js";

serveStdio().catch(() => {
  process.stderr.write("gramin MCP server could not start\n");
  process.exitCode = 1;
});
