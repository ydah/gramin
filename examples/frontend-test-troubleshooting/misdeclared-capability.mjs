#!/usr/bin/env node
import { ir } from "./sample-ir.mjs";

ir.capabilities.predicates = true;
process.stdout.write(`${JSON.stringify(ir)}\n`);
