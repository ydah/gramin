import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runAction } from "./action-runner.mjs";

let workspace: string;
let env: Record<string, string>;
const base = "a".repeat(40);
const features = { size: { rules: 2, alternatives: 3, terminals: 1 }, diagnostics: [] };

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "gramin-action-test-"));
  await writeFile(join(workspace, "grammar.y"), "%%\ns: 'x';\n");
  env = {
    GITHUB_WORKSPACE: workspace,
    GITHUB_EVENT_PATH: join(workspace, "event.json"),
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_OUTPUT: join(workspace, "outputs"),
    GITHUB_STEP_SUMMARY: join(workspace, "summary"),
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_JOB: "grammar",
    GITHUB_TOKEN: "test-token",
    GRAMIN_FILES: "grammar.y",
    GRAMIN_OUTPUT: "result.sarif",
  };
  await writeFile(
    env.GITHUB_EVENT_PATH,
    JSON.stringify({ number: 7, pull_request: { base: { sha: base } } }),
  );
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const runner = () =>
  vi.fn(
    async (
      command: string,
      args: string[],
      options: { cwd: string; env?: Record<string, string> },
    ) => {
      if (command === "git") {
        if (args[0] === "merge-base") return { status: 0, stdout: `${base}\n`, stderr: "" };
        if (args[0] === "ls-tree")
          return { status: 0, stdout: "100644 blob bbbbbbbb\tgrammar.y\0", stderr: "" };
        if (args[0] === "show") return { status: 0, stdout: "%%\ns: 'old';\n", stderr: "" };
        throw new Error(`unexpected git ${args.join(" ")}`);
      }
      expect(command).toBe("npx");
      expect(options.cwd).not.toBe(workspace);
      expect(args).toEqual(
        expect.arrayContaining(["--ignore-scripts", "--registry=https://registry.npmjs.org"]),
      );
      const output = args[args.indexOf("-o") + 1];
      await mkdir(dirname(output), { recursive: true });
      await writeFile(
        output,
        args.includes("diff")
          ? "# Grammar feature diff\n\nChanged.\n"
          : args.includes("sarif")
            ? "{}\n"
            : JSON.stringify(features),
      );
      expect(options.env).not.toHaveProperty("GIT_CONFIG_VALUE_0");
      return { status: 0, stdout: "", stderr: "" };
    },
  );

it("stages the merge-base source, writes reports and updates one bot comment", async () => {
  const run = runner();
  const request = vi
    .fn()
    .mockResolvedValueOnce([
      { id: 11, body: "<!-- unrelated -->", user: { login: "github-actions[bot]" } },
    ])
    .mockResolvedValueOnce({ id: 12 });
  const code = await runAction({ env, run, request, warn: vi.fn() });
  expect(code).toBe(0);
  const cli = run.mock.calls.filter(([command]) => command === "npx");
  expect(cli).toHaveLength(4);
  expect(cli[0]?.[1]).toContain("analyze");
  expect(cli.some(([, args]) => args.includes("--features") && args.includes("diff"))).toBe(true);
  expect(cli.some(([, args]) => args.includes("sarif") && args.includes("--baseline"))).toBe(true);
  const baselineCall = cli.find(([, args]) => args.includes("--source-root"));
  expect(baselineCall).toBeDefined();
  expect(await readFile(join(workspace, "summary"), "utf8")).toContain("Grammar feature diff");
  expect(await readFile(join(workspace, "outputs"), "utf8")).toContain("report=result.sarif");
  expect(request.mock.calls[1]?.[0]).toBe("POST");
  expect(request.mock.calls[1]?.[1]).toMatch(/\/issues\/7\/comments$/);
  expect(request.mock.calls[1]?.[2].body).toContain("<!-- gramin:");

  const marker = request.mock.calls[1]?.[2].body.match(/<!-- gramin:[^>]+ -->/)?.[0];
  const update = vi
    .fn()
    .mockResolvedValueOnce([{ id: 19, body: marker, user: { login: "github-actions[bot]" } }])
    .mockResolvedValueOnce({ id: 19 });
  await runAction({ env, run: runner(), request: update, warn: vi.fn() });
  expect(update.mock.calls[1]?.[0]).toBe("PATCH");
  expect(update.mock.calls[1]?.[1]).toMatch(/\/issues\/comments\/19$/);
});

it("uses an explicit baseline without git and forwards analysis inputs as separate arguments", async () => {
  env.GRAMIN_BASELINE = "checked-in.json";
  env.GRAMIN_FRONTEND = "yacc-family";
  env.GRAMIN_DIALECT = "lrama";
  env.GRAMIN_ANALYSIS = "lr";
  env.GRAMIN_SOURCE_ROOT = ".";
  env.GRAMIN_FAIL_ON_REGRESSION = "true";
  env.GRAMIN_COMMENT = "false";
  await writeFile(join(workspace, "checked-in.json"), JSON.stringify(features));
  const run = runner();
  const request = vi.fn();
  await runAction({ env, run, request, warn: vi.fn() });
  expect(run.mock.calls.every(([command]) => command === "npx")).toBe(true);
  const args = run.mock.calls[0]?.[1] ?? [];
  expect(args).toEqual(
    expect.arrayContaining(["--frontend", "yacc-family", "--dialect", "lrama", "--analysis", "lr"]),
  );
  expect(run.mock.calls.some(([, values]) => values.includes("--fail-on-regression"))).toBe(true);
  expect(request).not.toHaveBeenCalled();
});

it("writes a current summary when a dispatch has no automatic baseline", async () => {
  env.GITHUB_EVENT_NAME = "workflow_dispatch";
  await writeFile(env.GITHUB_EVENT_PATH, "{}");
  const run = runner();
  await runAction({ env, run, request: vi.fn(), warn: vi.fn() });
  expect(run.mock.calls).toHaveLength(2);
  expect(await readFile(join(workspace, "summary"), "utf8")).toContain("No automatic baseline");
});

it("reports a missing base file honestly while keeping the head report", async () => {
  const run = runner();
  run.mockImplementationOnce(async () => ({ status: 0, stdout: `${base}\n`, stderr: "" }));
  run.mockImplementationOnce(async () => ({ status: 0, stdout: "", stderr: "" }));
  const warn = vi.fn();
  await runAction({
    env,
    run,
    request: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({}),
    warn,
  });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("does not contain"));
  expect(await readFile(join(workspace, "summary"), "utf8")).toContain("does not contain");
  expect(run.mock.calls.filter(([command]) => command === "npx")).toHaveLength(2);
});

it("keeps diagnostic failure status after posting the diff and summary", async () => {
  const original = runner();
  const run = vi.fn(async (...args: Parameters<typeof original>) => ({
    ...(await original(...args)),
    status: args[1].includes("sarif") ? 1 : 0,
  }));
  const request = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({});
  expect(await runAction({ env, run, request, warn: vi.fn() })).toBe(1);
  expect(request).toHaveBeenCalledTimes(2);
  expect(await readFile(join(workspace, "summary"), "utf8")).toContain("Changed.");
});

it("warns about fork comment permissions without hiding successful analysis", async () => {
  const warn = vi.fn();
  expect(
    await runAction({
      env,
      run: runner(),
      request: vi.fn().mockRejectedValue(new Error("GitHub API 403")),
      warn,
    }),
  ).toBe(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("403"));
});

it("fetches shallow history with ephemeral credentials and keeps them away from CLI execution", async () => {
  const normal = runner();
  let attempts = 0;
  const run = vi.fn(async (...args: Parameters<typeof normal>) => {
    if (args[0] === "git" && args[1][0] === "merge-base" && attempts++ === 0)
      return { status: 1, stdout: "", stderr: "shallow" };
    if (args[0] === "git" && args[1][0] === "rev-parse")
      return { status: 0, stdout: "true\n", stderr: "" };
    if (args[0] === "git" && args[1][0] === "fetch") return { status: 0, stdout: "", stderr: "" };
    return normal(...args);
  });
  await runAction({
    env,
    run,
    request: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({}),
    warn: vi.fn(),
  });
  const fetch = run.mock.calls.find(([command, args]) => command === "git" && args[0] === "fetch");
  expect(fetch?.[1]).toContain("--unshallow");
  expect(fetch?.[2].env?.GIT_CONFIG_VALUE_0).toContain("AUTHORIZATION: basic ");
  expect(fetch?.[1].join(" ")).not.toContain(env.GITHUB_TOKEN);
});

it("does not reuse a baseline whose analysis failed", async () => {
  const normal = runner();
  const run = vi.fn(async (...args: Parameters<typeof normal>) => {
    if (args[0] === "npx" && args[1].includes("none"))
      return { status: 2, stdout: "", stderr: "bad base" };
    return normal(...args);
  });
  await runAction({
    env,
    run,
    request: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({}),
    warn: vi.fn(),
  });
  expect(run.mock.calls.some(([, args]) => args.includes("--features"))).toBe(false);
  expect(await readFile(join(workspace, "summary"), "utf8")).toContain("bad base");
});

it("refuses a regression gate without a measurable baseline", async () => {
  env.GITHUB_EVENT_NAME = "workflow_dispatch";
  env.GRAMIN_FAIL_ON_REGRESSION = "true";
  await expect(runAction({ env, run: runner(), request: vi.fn(), warn: vi.fn() })).rejects.toThrow(
    /Cannot apply fail-on-regression/,
  );
});

it("bounds Unicode summaries and comments at complete lines", async () => {
  const normal = runner();
  const run = vi.fn(async (...args: Parameters<typeof normal>) => {
    const result = await normal(...args);
    if (args[0] === "npx" && args[1].includes("diff")) {
      const output = args[1][args[1].indexOf("-o") + 1];
      await writeFile(
        output,
        `# Grammar feature diff\n\n${"| 語 | 1 | 2 | changed |\n".repeat(50_000)}`,
      );
    }
    return result;
  });
  const request = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({});
  await runAction({ env, run, request, warn: vi.fn() });
  const summary = await readFile(join(workspace, "summary"), "utf8");
  const comment = request.mock.calls[1]?.[2].body;
  expect(Buffer.byteLength(summary, "utf8")).toBeLessThanOrEqual(900_000);
  expect(Buffer.byteLength(comment, "utf8")).toBeLessThan(61_000);
  expect(summary).toContain("Report truncated");
  expect(comment).toContain("Report truncated");
  expect(summary).not.toContain("�");
  expect(comment).not.toContain("�");
});

it("keeps different workflows from replacing each other's comments", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({});
  env.GITHUB_WORKFLOW_REF = "owner/repo/.github/workflows/first.yml@refs/pull/7/merge";
  await runAction({ env, run: runner(), request, warn: vi.fn() });
  env.GITHUB_WORKFLOW_REF = "owner/repo/.github/workflows/second.yml@refs/pull/7/merge";
  await runAction({ env, run: runner(), request, warn: vi.fn() });
  const first = request.mock.calls[1]?.[2].body.match(/<!-- gramin:[^>]+ -->/)?.[0];
  const second = request.mock.calls[3]?.[2].body.match(/<!-- gramin:[^>]+ -->/)?.[0];
  expect(first).not.toBe(second);
});

it.each(["../outside.y", "/absolute.y", "--frontend", "grammar.y\u0000"])(
  "rejects unsafe input %s before invoking a command",
  async (input) => {
    env.GRAMIN_FILES = input;
    const run = runner();
    await expect(runAction({ env, run, request: vi.fn(), warn: vi.fn() })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  },
);

it("rejects a head symlink outside the workspace", async () => {
  const outside = await mkdtemp(join(tmpdir(), "gramin-action-outside-"));
  try {
    await writeFile(join(outside, "secret.y"), "secret");
    await symlink(join(outside, "secret.y"), join(workspace, "link.y"));
    env.GRAMIN_FILES = "link.y";
    await expect(
      runAction({ env, run: runner(), request: vi.fn(), warn: vi.fn() }),
    ).rejects.toThrow(/workspace/);
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

it("rejects output symlinks outside the workspace and preserves grammar inputs", async () => {
  const outside = await mkdtemp(join(tmpdir(), "gramin-action-output-"));
  try {
    await writeFile(join(outside, "private"), "unchanged");
    await symlink(join(outside, "private"), join(workspace, "result.sarif"));
    await expect(
      runAction({ env, run: runner(), request: vi.fn(), warn: vi.fn() }),
    ).rejects.toThrow(/workspace/);
    expect(await readFile(join(outside, "private"), "utf8")).toBe("unchanged");
    env.GRAMIN_OUTPUT = "grammar.y";
    await expect(
      runAction({ env, run: runner(), request: vi.fn(), warn: vi.fn() }),
    ).rejects.toThrow(/overwrite/);
    expect(await readFile(join(workspace, "grammar.y"), "utf8")).toContain("s: 'x'");
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

it("reads actual Git blobs at the merge-base without changing the checkout", async () => {
  const isolatedConfig = join(workspace, "empty-git-config");
  await writeFile(isolatedConfig, "");
  const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: isolatedConfig };
  const git = (args: string[]) => {
    const result = spawnSync(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        ...args,
      ],
      { cwd: workspace, encoding: "utf8", env: gitEnv },
    );
    expect(result.stderr, args.join(" ")).not.toContain("fatal:");
    expect(result.status, args.join(" ")).toBe(0);
    return result.stdout.trim();
  };
  git(["init", "--quiet"]);
  git(["add", "grammar.y"]);
  git(["commit", "--quiet", "-m", "base fixture"]);
  const revision = git(["rev-parse", "HEAD"]);
  await writeFile(join(workspace, "grammar.y"), "%%\ns: 'new';\n");
  git(["add", "grammar.y"]);
  git(["commit", "--quiet", "-m", "head fixture"]);
  await writeFile(
    env.GITHUB_EVENT_PATH,
    JSON.stringify({ number: 7, pull_request: { base: { sha: revision } } }),
  );
  env.GRAMIN_FILES = "./grammar.y";
  env.GRAMIN_COMMENT = "false";
  const normal = runner();
  const run = vi.fn(async (...args: Parameters<typeof normal>) => {
    if (args[0] === "git")
      return spawnSync("git", args[1], { ...args[2], env: gitEnv, encoding: "utf8" });
    const source = args[1][args[1].indexOf("analyze") + 1];
    if (args[1].includes("analyze"))
      expect(await readFile(source, "utf8")).toContain(
        args[1].includes("none") ? "s: 'x'" : "s: 'new'",
      );
    return normal(...args);
  });
  expect(await runAction({ env, run, request: vi.fn(), warn: vi.fn() })).toBe(0);
  expect(git(["rev-parse", "HEAD"])).not.toBe(revision);
  expect(await readFile(join(workspace, "grammar.y"), "utf8")).toContain("s: 'new'");

  const shallow = join(workspace, "shallow-checkout");
  git(["clone", "--quiet", "--depth", "1", "--no-local", pathToFileURL(workspace).href, shallow]);
  env.GITHUB_WORKSPACE = shallow;
  const shallowRun = vi.fn(async (...args: Parameters<typeof normal>) => {
    if (args[0] === "git")
      return spawnSync("git", args[1], { ...args[2], env: gitEnv, encoding: "utf8" });
    return normal(...args);
  });
  const warn = vi.fn();
  expect(await runAction({ env, run: shallowRun, request: vi.fn(), warn })).toBe(0);
  expect(warn).not.toHaveBeenCalled();
  expect(shallowRun.mock.calls.some(([, args]) => args.includes("--features"))).toBe(true);
});
