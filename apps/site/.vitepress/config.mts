import { defineConfig } from "vitepress";

const siteBase = process.env.VITE_SITE_BASE ?? "/gramin/";

export default defineConfig({
  base: siteBase,
  cleanUrls: true,
  description:
    "Structural analysis for parser grammars: common IR, deterministic features, and reviewable reports.",
  head: [
    ["meta", { name: "theme-color", content: "#f5f2ea" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Gramin — Structural analysis for parser grammars" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Turn grammar files into facts you can review.",
      },
    ],
    ["meta", { property: "og:image", content: `${siteBase}og-image.svg` }],
    ["link", { rel: "icon", href: `${siteBase}logo.svg` }],
  ],
  title: "Gramin",
  themeConfig: {
    logo: { src: "/logo.svg", alt: "Gramin" },
    siteTitle: "Gramin",
    nav: [
      { text: "Overview", link: "/" },
      { text: "Sandbox", link: "/sandbox" },
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/" },
      { text: "GitHub", link: "https://github.com/ydah/gramin" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "How it works", link: "/guide/how-it-works" },
            { text: "Reviewing grammar changes", link: "/guide/reviewing-changes" },
            { text: "GitHub Actions and SARIF", link: "/guide/github-actions" },
          ],
        },
        {
          text: "Concepts",
          items: [
            { text: "Metric comparability", link: "/concepts/comparability" },
            { text: "Safety and boundaries", link: "/concepts/safety" },
          ],
        },
      ],
      "/formats/": [
        {
          text: "Formats",
          items: [{ text: "Support matrix", link: "/formats/" }],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Reference overview", link: "/reference/" },
            { text: "Grammar IR", link: "/reference/grammar-ir" },
            { text: "Grammar Features", link: "/reference/features" },
            { text: "Metrics catalog", link: "/reference/metrics" },
            { text: "Diagnostics", link: "/reference/diagnostics" },
            { text: "External frontend protocol", link: "/reference/frontend-protocol" },
          ],
        },
      ],
    },
    outline: [2, 3],
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/ydah/gramin" }],
    footer: {
      message: "Structural facts for parser grammars.",
      copyright: "Released under the MIT License.",
    },
  },
  vite: {
    resolve: { dedupe: ["vue"] },
  },
});
