import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("apps/site/.vitepress/dist");
const siteBase = "/gramin/";

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(file)));
    else if (entry.name.endsWith(".html")) files.push(file);
  }
  return files;
};

const routeForFile = (file) => {
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (relative === "index.html") return siteBase;
  if (relative.endsWith("/index.html"))
    return `${siteBase}${relative.slice(0, -"index.html".length)}`;
  return `${siteBase}${relative.slice(0, -".html".length)}`;
};

const existsForRoute = async (route) => {
  const withoutBase = route.startsWith(siteBase) ? route.slice(siteBase.length) : route.slice(1);
  const clean = withoutBase.replace(/\/$/, "");
  const candidates = clean
    ? [
        path.join(root, clean),
        path.join(root, `${clean}.html`),
        path.join(root, clean, "index.html"),
      ]
    : [path.join(root, "index.html")];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return true;
    } catch {
      // Try the next representation of this clean URL.
    }
  }
  return false;
};

const files = await walk(root);
const broken = [];
for (const file of files) {
  const html = await readFile(file, "utf8");
  const pageRoute = routeForFile(file);
  const hrefs = html.matchAll(/href="([^"]+)"/g);
  for (const match of hrefs) {
    const href = match[1];
    if (!href || href.startsWith("#") || /^(?:https?:|mailto:|data:|javascript:)/.test(href))
      continue;
    const target = new URL(href, `https://gramin.local${pageRoute}`).pathname;
    if (!(await existsForRoute(target)))
      broken.push(`${path.relative(process.cwd(), file)} -> ${href}`);
  }
}

if (broken.length > 0) {
  console.error("Broken site links:");
  for (const link of broken) console.error(`- ${link}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} generated HTML pages; all internal links resolve.`);
}
