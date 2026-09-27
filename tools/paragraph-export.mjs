#!/usr/bin/env node
// Export every published Pioneering Spirit post from Paragraph into
// corpus/paragraph/ as Markdown with front matter. This is a one-time
// migration (re-runnable while you still publish on Paragraph); nothing here
// syncs into the blyg.
//
//   PARAGRAPH_API_KEY=... npm run export-paragraph
//
// Environment:
//   PARAGRAPH_API_KEY   Optional bearer token (app.paragraph.com -> Settings -> API keys).
//   PARAGRAPH_DOMAIN    Default: pioneeringspirit.xyz
//   PARAGRAPH_API_BASE  Default: https://public.api.paragraph.com/api

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "corpus", "paragraph");
const DOMAIN = process.env.PARAGRAPH_DOMAIN ?? "pioneeringspirit.xyz";
const API = (process.env.PARAGRAPH_API_BASE ?? "https://public.api.paragraph.com/api").replace(/\/+$/, "");
const KEY = process.env.PARAGRAPH_API_KEY ?? "";

async function get(urlPath, params = {}) {
  const url = new URL(API + urlPath);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: KEY ? { Authorization: `Bearer ${KEY}` } : {} });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function isoDate(epochMs) {
  const n = Number(epochMs);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString().replace(/\.\d{3}Z$/, "Z") : "";
}

function fm(value) {
  const v = String(value ?? "");
  return v === "" ? "" : JSON.stringify(v);
}

const pub = await get(`/v1/publications/domain/${DOMAIN}`);
console.log(`Publication: ${pub.name} (${pub.id})`);

const posts = [];
let cursor;
do {
  const page = await get(`/v1/publications/${pub.id}/posts`, { includeContent: "true", limit: 100, ...(cursor ? { cursor } : {}) });
  posts.push(...(page.items ?? []));
  cursor = page.pagination?.hasMore ? page.pagination.cursor : undefined;
  console.log(`  fetched ${posts.length} posts`);
} while (cursor);

mkdirSync(OUT, { recursive: true });
const index = [];
for (const post of posts) {
  const slug = post.slug || post.id;
  const published = isoDate(post.publishedAt);
  const body = (post.markdown ?? "").trim();
  if (!body) {
    console.warn(`  skipped "${post.title}" (no markdown content)`);
    continue;
  }
  const file = `${published.slice(0, 10) || "undated"}-${slug}.md`;
  const meta = [
    `title: ${fm(post.title)}`,
    `subtitle: ${fm(post.subtitle)}`,
    `date: ${published}`,
    `updated: ${isoDate(post.updatedAt)}`,
    `slug: ${fm(slug)}`,
    `url: ${fm(`https://${DOMAIN}/${slug}`)}`,
    `paragraph_id: ${fm(post.id)}`,
    `cover_image: ${fm(post.imageUrl ?? post.coverImage ?? "")}`,
  ];
  writeFileSync(path.join(OUT, file), `---\n${meta.join("\n")}\n---\n\n${body}\n`);
  index.push({ file, slug, title: post.title ?? "", date: published });
}

index.sort((a, b) => (a.date < b.date ? 1 : -1));
writeFileSync(
  path.join(OUT, "_publication.json"),
  JSON.stringify({ name: pub.name, summary: pub.summary ?? "", domain: DOMAIN, exported: new Date().toISOString(), posts: index }, null, 2) + "\n",
);
console.log(`Wrote ${index.length} posts to ${path.relative(ROOT, OUT)}/`);
