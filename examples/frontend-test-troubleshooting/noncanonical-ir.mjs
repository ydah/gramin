#!/usr/bin/env node
import { ir } from "./sample-ir.mjs";

ir.rules[0].alternatives[0].items = [{ kind: "seq", items: [{ kind: "terminal", literal: "x" }] }];
process.stdout.write(`${JSON.stringify(ir)}\n`);
