#!/usr/bin/env node
// Render corpus/paragraph/*.md into archive-site/, which the Worker serves as
// static assets (see "assets" in wrangler.jsonc). Every old Paragraph URL,
// pioneeringspirit.xyz/<slug>, keeps working on your own domain after the
// cutover, and /paragraph/ lists the whole archive. Blyg routes are never
// shadowed: nothing is written at the root or at any protocol path.
//
//   npm run build-archive
//
// A post whose front matter carries `redirect_to:` (for example, the thread
// that superseded it) becomes a redirect page instead of a copy.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "corpus", "paragraph");
const OUT = path.join(ROOT, "archive-site");
const require = createRequire(path.join(ROOT, "worker", "package.json"));
const md = require("markdown-it")({ html: true, linkify: true, typographer: true });

// Paths the blyg itself owns at the root mount. An old slug that collides with
// one of these is skipped rather than allowed to shadow the protocol surface.
const RESERVED = new Set(["", "f", "t", "h", "items", "media", "studio", "api", "archive", "webmention", "style.css", "feed.xml", "blyg.json", "blogroll.opml", "paragraph"]);

function readPost(file) {
  const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  for (const line of (m?.[1] ?? "").split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].trim();
    meta[kv[1]] = /^"/.test(v) ? JSON.parse(v) : v;
  }
  return { meta, body: m ? raw.slice(m[0].length) : raw };
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page({ title, description, canonical, content }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<link rel="blyg" href="/">
<link rel="alternate" type="application/rss+xml" title="Pioneering Spirit" href="/feed.xml">
<style>
:root { color-scheme: light dark; --fg: #1d1d1b; --bg: #fbfaf6; --muted: #6b6a64; --rule: #e2dfd6; --link: #1f5f8b; }
@media (prefers-color-scheme: dark) { :root { --fg: #e9e6de; --bg: #171715; --muted: #a09d94; --rule: #34332f; --link: #8cc4ea; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 18px/1.65 Georgia, "Iowan Old Style", serif; }
main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
a { color: var(--link); }
img { max-width: 100%; height: auto; }
blockquote { margin: 1.25rem 0; padding-left: 1rem; border-left: 3px solid var(--rule); color: var(--muted); }
pre { overflow-x: auto; }
.banner { font: 14px/1.5 system-ui, sans-serif; color: var(--muted); border-bottom: 1px solid var(--rule); padding-bottom: 0.75rem; margin-bottom: 2rem; }
.meta { font: 15px/1.5 system-ui, sans-serif; color: var(--muted); }
h1 { line-height: 1.2; margin-bottom: 0.25rem; }
.subtitle { font-style: italic; color: var(--muted); margin-top: 0; }
ol.archive { padding-left: 0; list-style: none; }
ol.archive li { margin: 0.6rem 0; }
</style>
</head>
<body><main>
<div class="banner">From the <a href="/paragraph/">Pioneering Spirit archive</a> (originally published on Paragraph). The living blyg is at <a href="/">pioneeringspirit.xyz</a>.</div>
${content}
</main></body>
</html>
`;
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => f.endsWith(".md")).sort().reverse() : [];
const listed = [];
for (const file of files) {
  const { meta, body } = readPost(path.join(SRC, file));
  const slug = (meta.slug || "").replace(/^\/+|\/+$/g, "");
  if (!slug || RESERVED.has(slug.split("/")[0])) {
    console.warn(`  skipped ${file}: slug "${slug}" is empty or collides with a blyg route`);
    continue;
  }
  const dir = path.join(OUT, slug);
  mkdirSync(dir, { recursive: true });
  if (meta.redirect_to) {
    const to = esc(meta.redirect_to);
    writeFileSync(path.join(dir, "index.html"), `<!doctype html><meta charset="utf-8"><title>Moved</title><link rel="canonical" href="${to}"><meta http-equiv="refresh" content="0; url=${to}"><p>This post now lives at <a href="${to}">${to}</a>.</p>\n`);
  } else {
    const date = (meta.date || "").slice(0, 10);
    const content = `<article>
<h1>${esc(meta.title)}</h1>
${meta.subtitle ? `<p class="subtitle">${esc(meta.subtitle)}</p>` : ""}
<p class="meta">${date ? `<time datetime="${esc(meta.date)}">${esc(date)}</time>` : ""}</p>
${md.render(body)}
</article>`;
    writeFileSync(path.join(dir, "index.html"), page({ title: `${meta.title} | Pioneering Spirit`, description: meta.subtitle, canonical: `https://pioneeringspirit.xyz/${slug}/`, content }));
  }
  listed.push({ slug, title: meta.title || slug, date: (meta.date || "").slice(0, 10), moved: !!meta.redirect_to });
}

const items = listed.map((p) => `<li><span class="meta">${esc(p.date)}</span> &nbsp;<a href="/${esc(p.slug)}/">${esc(p.title)}</a></li>`).join("\n");
mkdirSync(path.join(OUT, "paragraph"), { recursive: true });
writeFileSync(
  path.join(OUT, "paragraph", "index.html"),
  page({
    title: "Archive | Pioneering Spirit",
    canonical: "https://pioneeringspirit.xyz/paragraph/",
    content: `<h1>The Pioneering Spirit archive</h1>\n<p>Everything published on Paragraph before the move to a blyg, kept at its original address.</p>\n<ol class="archive">\n${items}\n</ol>`,
  }),
);
console.log(`Built ${listed.length} archive pages into ${path.relative(ROOT, OUT)}/`);
