import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const escapeCommand = (value) =>
  String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const warning = (message) => process.stderr.write(`::warning::${escapeCommand(message)}\n`);

const runProcess = (command, args, options) => {
  if (command === "npx" && process.platform === "win32") {
    const executable = join(dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
    if (!existsSync(executable)) throw new Error("Cannot locate the setup-node npm installation");
    return spawnSync(process.execPath, [executable, ...args], {
      ...options,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 180_000,
    });
  }
  return spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180_000,
  });
};

const safePath = (value) => {
  const normalized = value.replaceAll("\\", "/");
  if (
    !normalized ||
    isAbsolute(normalized) ||
    /^[A-Za-z]:/u.test(normalized) ||
    /[\r\n\0]/u.test(normalized) ||
    normalized.startsWith("-") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`Expected a relative path inside the workspace: ${JSON.stringify(value)}`);
  }
  return posix.normalize(normalized);
};

const inside = (root, path) => {
  const pathFromRoot = relative(root, path);
  return !isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`);
};

const assertInput = async (workspace, path) => {
  const resolved = await realpath(resolve(workspace, path));
  if (!inside(workspace, resolved) || !(await stat(resolved)).isFile()) {
    throw new Error(`Input must be a regular file inside the workspace: ${path}`);
  }
};

const assertOutput = async (workspace, output, inputs) => {
  const destination = resolve(workspace, output);
  const parent = await realpath(dirname(destination));
  if (!inside(workspace, parent)) throw new Error("Output must remain inside the workspace");
  let resolved = destination;
  try {
    resolved = await realpath(destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!inside(workspace, resolved)) throw new Error("Output must remain inside the workspace");
  for (const input of inputs) {
    if (resolved === (await realpath(resolve(workspace, input))))
      throw new Error("Output must not overwrite an input file");
  }
};

const checkResult = (result, label, allowPartial = false) => {
  if (result.error || result.status === null || result.status > (allowPartial ? 1 : 0)) {
    throw new Error(
      `${label} failed: ${result.error?.message ?? result.stderr?.slice(0, 4000) ?? `exit ${result.status}`}`,
    );
  }
  return result;
};

const githubRequest = (env) => async (method, url, body) => {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`GitHub API ${response.status} while ${method} ${new URL(url).pathname}`);
  return response.json();
};

const postComment = async (env, number, marker, body, request) => {
  if (
    !/^[\w.-]+\/[\w.-]+$/u.test(env.GITHUB_REPOSITORY ?? "") ||
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    throw new Error("Cannot identify the pull request for a comment");
  }
  const api = env.GITHUB_API_URL ?? "https://api.github.com";
  if (new URL(api).protocol !== "https:") throw new Error("GitHub API URL must use HTTPS");
  const repository = `${api.replace(/\/$/u, "")}/repos/${env.GITHUB_REPOSITORY}`;
  for (let page = 1; ; page += 1) {
    const comments = await request(
      "GET",
      `${repository}/issues/${number}/comments?per_page=100&page=${page}`,
    );
    if (!Array.isArray(comments)) throw new Error("Invalid GitHub comments response");
    const existing = comments.find(
      (comment) =>
        comment.user?.login === "github-actions[bot]" &&
        typeof comment.body === "string" &&
        comment.body.includes(marker),
    );
    if (existing) {
      await request("PATCH", `${repository}/issues/comments/${existing.id}`, { body });
      return;
    }
    if (comments.length < 100) break;
  }
  await request("POST", `${repository}/issues/${number}/comments`, { body });
};

const currentSummary = (features) =>
  `# Grammar features\n\n| Metric | Value |\n|---|---:|\n| Rules | ${features.size.rules} |\n| Alternatives | ${features.size.alternatives} |\n| Terminals | ${features.size.terminals} |\n`;

const boundedMarkdown = (text, byteLimit) => {
  if (Buffer.byteLength(text, "utf8") <= byteLimit) return text;
  const notice = "\n\n_Report truncated; the full SARIF report remains available._\n";
  let used = Buffer.byteLength(notice, "utf8");
  const lines = [];
  for (const line of text.split("\n")) {
    const size = Buffer.byteLength(line, "utf8") + 1;
    if (used + size > byteLimit) break;
    lines.push(line);
    used += size;
  }
  return lines.join("\n") + notice;
};

export const runAction = async ({
  env = process.env,
  run = runProcess,
  request = githubRequest(env),
  warn = warning,
} = {}) => {
  const workspace = await realpath(env.GITHUB_WORKSPACE ?? process.cwd());
  const files = (env.GRAMIN_FILES ?? "")
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean)
    .map(safePath);
  if (files.length === 0) throw new Error("gramin action requires at least one grammar file");
  const output = safePath(env.GRAMIN_OUTPUT ?? "gramin.sarif");
  const baselineInput = env.GRAMIN_BASELINE ? safePath(env.GRAMIN_BASELINE) : undefined;
  const sourceRoot = resolve(workspace, safePath(env.GRAMIN_SOURCE_ROOT || "."));
  if (!inside(workspace, sourceRoot)) throw new Error("source-root must be inside the workspace");
  await Promise.all(files.map((file) => assertInput(workspace, file)));
  if (baselineInput) await assertInput(workspace, baselineInput);
  await assertOutput(workspace, output, [...files, ...(baselineInput ? [baselineInput] : [])]);
  const packageName = env.GRAMIN_CLI_PACKAGE ?? "@gramin/cli@1.0.0";
  if (!/^@gramin\/cli@\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(packageName))
    throw new Error("Expected a pinned @gramin/cli version");
  const event = env.GITHUB_EVENT_PATH
    ? JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"))
    : {};
  const options = [
    ...(env.GRAMIN_FRONTEND ? ["--frontend", env.GRAMIN_FRONTEND] : []),
    ...(env.GRAMIN_DIALECT ? ["--dialect", env.GRAMIN_DIALECT] : []),
    ...(env.GRAMIN_ANALYSIS ? ["--analysis", env.GRAMIN_ANALYSIS] : []),
  ];
  const failOn = env.GRAMIN_FAIL_ON ?? "error";
  const regression = env.GRAMIN_FAIL_ON_REGRESSION === "true";
  const temporary = await mkdtemp(join(env.RUNNER_TEMP ?? tmpdir(), "gramin-action-"));
  const commandOptions = { cwd: temporary, env };
  const git = async (args, gitEnv = env) => run("git", args, { cwd: workspace, env: gitEnv });
  const cli = async (args) =>
    checkResult(
      await run(
        "npx",
        [
          "--yes",
          "--ignore-scripts",
          "--registry=https://registry.npmjs.org",
          packageName,
          ...args,
        ],
        commandOptions,
      ),
      "gramin",
      true,
    ).status;
  let baseline = baselineInput === undefined ? undefined : resolve(workspace, baselineInput);
  let baselineReason =
    "No automatic baseline is available for this event. Provide the baseline input to compare features.";
  try {
    const before =
      env.GITHUB_EVENT_NAME === "pull_request"
        ? event.pull_request?.base?.sha
        : env.GITHUB_EVENT_NAME === "push"
          ? event.before
          : undefined;
    if (
      !baseline &&
      typeof before === "string" &&
      /^[a-f0-9]{40,64}$/u.test(before) &&
      !/^0+$/u.test(before)
    ) {
      try {
        let merged = await git(["merge-base", before, "HEAD"]);
        if (merged.status !== 0) {
          const shallow =
            checkResult(
              await git(["rev-parse", "--is-shallow-repository"]),
              "git shallow check",
            ).stdout.trim() === "true";
          const server = new URL(env.GITHUB_SERVER_URL ?? "https://github.com");
          if (server.protocol !== "https:") throw new Error("GitHub server URL must use HTTPS");
          const fetchEnv = env.GITHUB_TOKEN
            ? {
                ...env,
                GIT_TERMINAL_PROMPT: "0",
                GIT_CONFIG_COUNT: "1",
                GIT_CONFIG_KEY_0: `http.${server.origin}/.extraheader`,
                GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${env.GITHUB_TOKEN}`).toString("base64")}`,
              }
            : { ...env, GIT_TERMINAL_PROMPT: "0" };
          checkResult(
            await git(
              ["fetch", "--no-tags", ...(shallow ? ["--unshallow"] : []), "origin", before],
              fetchEnv,
            ),
            "git baseline fetch",
          );
          merged = await git(["merge-base", before, "HEAD"]);
        }
        const revision = checkResult(merged, "git merge-base").stdout.trim();
        if (!/^[a-f0-9]{40,64}$/u.test(revision))
          throw new Error("git returned an invalid merge-base");
        const sources = join(temporary, "source");
        let complete = true;
        for (const file of files) {
          const entry = checkResult(
            await git(["ls-tree", "-z", revision, "--", file]),
            "git baseline file",
          ).stdout;
          if (
            !/^100(?:644|755) blob [a-f0-9]+\t/u.test(entry) ||
            entry.slice(entry.indexOf("\t") + 1) !== `${file}\0`
          ) {
            baselineReason = `The merge-base does not contain a regular file at ${file}; no feature comparison was made.`;
            complete = false;
            break;
          }
          const content = checkResult(
            await git(["show", `${revision}:${file}`]),
            "git baseline source",
          ).stdout;
          const destination = join(sources, file);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, content);
        }
        if (complete) {
          baseline = join(temporary, "baseline.features.json");
          await cli([
            "analyze",
            ...files.map((file) => join(sources, file)),
            ...options,
            "--source-root",
            join(sources, relative(workspace, sourceRoot)),
            "--format",
            "json",
            "--fail-on",
            "none",
            "-o",
            baseline,
          ]);
        } else warn(baselineReason);
      } catch (error) {
        baseline = undefined;
        baselineReason = `Automatic baseline unavailable: ${error.message}`;
        warn(baselineReason);
      }
    }
    if (!baseline && regression)
      throw new Error(`Cannot apply fail-on-regression. ${baselineReason}`);
    const head = join(temporary, "head.features.json");
    const headArgs = [
      "analyze",
      ...files.map((file) => resolve(workspace, file)),
      ...options,
      "--source-root",
      sourceRoot,
      "--fail-on",
      failOn,
    ];
    const headStatus = await cli([...headArgs, "--format", "json", "-o", head]);
    const sarifStatus = await cli([
      ...headArgs,
      "--format",
      "sarif",
      ...(baseline ? ["--baseline", baseline] : []),
      ...(regression ? ["--fail-on-regression"] : []),
      "-o",
      resolve(workspace, output),
    ]);
    let summary;
    let diffStatus = 0;
    if (baseline) {
      const diff = join(temporary, "diff.md");
      diffStatus = await cli([
        "diff",
        baseline,
        head,
        "--features",
        "--format",
        "md",
        ...(regression ? ["--fail-on-regression"] : []),
        "-o",
        diff,
      ]);
      summary = await readFile(diff, "utf8");
    } else
      summary = `${currentSummary(JSON.parse(await readFile(head, "utf8")))}\n${baselineReason}\n`;
    if (env.GITHUB_STEP_SUMMARY)
      await appendFile(env.GITHUB_STEP_SUMMARY, boundedMarkdown(summary, 900_000));
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `report=${output}\n`);
    if (env.GITHUB_EVENT_NAME === "pull_request" && env.GRAMIN_COMMENT !== "false") {
      if (!env.GITHUB_TOKEN) warn("PR comment skipped: no GitHub token is available.");
      else {
        const workflow = (env.GITHUB_WORKFLOW_REF ?? env.GITHUB_WORKFLOW ?? "").split("@")[0];
        const identity = `${workflow}\0${env.GITHUB_JOB ?? ""}\0${output}`;
        const marker = `<!-- gramin:${createHash("sha256").update(identity).digest("hex").slice(0, 16)} -->`;
        const body = `${marker}\n${boundedMarkdown(summary, 60_000)}`;
        try {
          await postComment(env, event.number ?? event.pull_request?.number, marker, body, request);
        } catch (error) {
          warn(
            `PR comment could not be updated: ${error.message}. Fork pull requests usually have a read-only token; the job summary remains available.`,
          );
        }
      }
    }
    return Math.max(headStatus, sarifStatus, diffStatus);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAction()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`::error::${escapeCommand(error.message)}\n`);
      process.exitCode = 2;
    });
}
