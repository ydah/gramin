import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = "examples/frontend-test-troubleshooting";

describe("frontend conformance troubleshooting examples", () => {
  it.each([
    { frontend: "misdeclared-capability.mjs", status: 2, code: "IR_CANON_PREDICATES_CAPABILITY" },
    { frontend: "noncanonical-ir.mjs", status: 2, code: "IR_CANON_TOP_LEVEL_SEQ" },
    { frontend: "nondeterministic.mjs", status: 1, code: "FRONTEND_NONDETERMINISTIC" },
  ])("reports $code for $frontend", ({ frontend, status, code }) => {
    const result = spawnSync(
      process.execPath,
      [
        "packages/cli/dist/bin.js",
        "frontend-test",
        `${directory}/sample.bnf`,
        "--frontend-cmd",
        `./${directory}/${frontend}`,
      ],
      { cwd: root, encoding: "utf8", timeout: 10_000 },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(status);
    expect(result.stderr).toContain(code);
    if (status === 1) {
      expect(JSON.parse(result.stdout)).toMatchObject({
        checks: { schema: true, canonicalForm: true, capabilities: true, repeatable: false },
        runs: 2,
      });
    } else {
      expect(result.stdout).toBe("");
    }
    expect(readFileSync(new URL(`../../../${directory}/sample.bnf`, import.meta.url), "utf8")).toBe(
      'start ::= "x";\n',
    );
  });
});
