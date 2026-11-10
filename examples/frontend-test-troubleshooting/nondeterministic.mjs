#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { ir } from "./sample-ir.mjs";

ir.diagnostics.push({ severity: "warning", code: "EXAMPLE_RUN_ID", message: randomUUID() });
process.stdout.write(`${JSON.stringify(ir)}\n`);
