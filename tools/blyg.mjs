#!/usr/bin/env node
// blyg — write in this repo, publish to the Pioneering Spirit blyg.
//
// A draft is a Markdown file with a small front-matter block:
//
//   ---
//   kind: thread            # or fragment (max 1,000 characters once published)
//   id:                     # filled in by `push`; never edit by hand
//   version: 0              # last published version, filled in by `publish`
//   note:                   # optional version note, consumed by the next publish
//   stub_of:                # optional, threads only: what this responds to, either
//                           # a URL or {"origin": "...", "id": "...", "version": N}
//   ---
//   Your markdown. Threads can quote with ![[id]] on its own line.
//   Either kind can ask for AI prose with [TK]an instruction[/TK].
//
// Commands (run as `npm run blyg -- <command> ...`):
//
//   login                       start a studio session (BLYG_PASSWORD or prompt)
//   push <file>                 create or update the studio draft (working copy)
//   generate <file> [--all]     push, run every ungenerated [TK] scope, pull the result
//   publish <file> [--note ""]  push, then publish the next version
//   pull <file>                 overwrite the file with the studio working copy
//   find [query]                search published items to quote with ![[id]]
//   quote <corpus-file> ...     make a fragment draft from a corpus passage
//   new <file> [--kind k]       start an empty draft file
//   settings [file]             push studio settings (default: blyg.settings.json)
//   status [dir]                list drafts with their ids and versions
//
// Environment: BLYG_URL (default https://pioneeringspirit.xyz), BLYG_PASSWORD.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const SESSION_FILE = path.join(ROOT, ".blyg-session");
const BASE = (process.env.BLYG_URL ?? "https://pioneeringspirit.xyz").replace(/\/+$/, "");
const FRAGMENT_MAX = 1000;
const ID_RE = /^[0-9a-hjkmnp-tv-z]{26}$/;

// ---------------------------------------------------------------------------
// Front matter: a flat `key: value` block. Deliberately not full YAML.
// ---------------------------------------------------------------------------

function readDraft(file) {
  const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (m) {
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (kv) meta[kv[1]] = parseValue(kv[2]);
    }
  }
  const body = m ? raw.slice(m[0].length) : raw;
  return { meta, body: body.replace(/^\n+/, "").replace(/\s+$/, "") + "\n" };
}

// A value is either a JSON-quoted string or bare text with an optional
// trailing ` # comment`.
function parseValue(v) {
  const quoted = v.match(/^("(?:[^"\\]|\\.)*")\s*(#.*)?$/);
  if (quoted) return JSON.parse(quoted[1]);
  if (v.trim().startsWith("{")) return JSON.parse(v.trim());
  return v.replace(/(^|\s)#.*$/, "").trim();
}

function writeDraft(file, meta, body) {
  const order = ["kind", "id", "version", "note", "stub_of", "source", "source_url"];
  const keys = [...order.filter((k) => k in meta), ...Object.keys(meta).filter((k) => !order.includes(k))];
  const lines = keys.map((k) => {
    if (meta[k] && typeof meta[k] === "object") return `${k}: ${JSON.stringify(meta[k])}`;
    const v = meta[k] == null ? "" : String(meta[k]);
    return v === "" ? `${k}:` : `${k}: ${/[#:]/.test(v) ? JSON.stringify(v) : v}`;
  });
  writeFileSync(file, `---\n${lines.join("\n")}\n---\n\n${body.replace(/\s+$/, "")}\n`);
}

// ---------------------------------------------------------------------------
// Studio session and HTTP
// ---------------------------------------------------------------------------

function loadCookie() {
  if (!existsSync(SESSION_FILE)) return null;
  const s = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
  return s.base === BASE ? s.cookie : null;
}

async function login() {
  let password = process.env.BLYG_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question(`Studio password for ${BASE}: `);
    rl.close();
  }
  const res = await fetch(`${BASE}/studio/login`, {
    method: "POST",
    body: new URLSearchParams({ password }),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (res.status !== 302 || !setCookie) fail(`login failed (HTTP ${res.status}); check the password and BLYG_URL`);
  const cookie = setCookie.split(";")[0];
  writeFileSync(SESSION_FILE, JSON.stringify({ base: BASE, cookie }) + "\n", { mode: 0o600 });
  console.log(`Logged in to ${BASE}. The session lasts 30 days.`);
  return cookie;
}

async function request(method, urlPath, body, { retry = true } = {}) {
  const cookie = loadCookie() ?? (await login());
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const expired = res.status === 401 || (res.status === 302 && res.headers.get("location")?.includes("/studio/login"));
  if (expired && retry) {
    await login();
    return request(method, urlPath, body, { retry: false });
  }
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) fail(`${method} ${urlPath} -> HTTP ${res.status}\n${typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data, null, 2)}`);
  return data;
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function push(file, { quiet = false } = {}) {
  const { meta, body } = readDraft(file);
  const kind = meta.kind === "fragment" ? "fragment" : "thread";
  if (kind === "fragment") {
    const stripped = stripTk(body).trim();
    if (stripped.length > FRAGMENT_MAX) {
      console.warn(`warning: fragment is ${stripped.length} characters; publish will refuse anything over ${FRAGMENT_MAX}.`);
    }
  }
  const stub = stubOf(meta, kind);
  if (!meta.id) {
    const created = await request("POST", "/api/items", { kind, content_md: body, ...(stub !== undefined ? { stub_of: stub } : {}) });
    meta.id = created.id;
    meta.kind = kind;
    meta.version ??= "0";
    writeDraft(file, meta, body);
    if (!quiet) console.log(`Created ${kind} draft ${meta.id}.`);
  } else {
    if (!ID_RE.test(meta.id)) fail(`${file}: front-matter id "${meta.id}" is not a blyg id`);
    await request("PATCH", `/api/items/${meta.id}`, { content_md: body, ...(stub !== undefined ? { stub_of: stub } : {}) });
    if (!quiet) console.log(`Saved working copy of ${meta.id}.`);
  }
  return { meta, body, kind };
}

async function publish(file, note) {
  const { meta, body, kind } = await push(file, { quiet: true });
  const versionNote = note ?? meta.note ?? "";
  const result = await request("POST", `/api/items/${meta.id}/publish`, versionNote ? { note: versionNote } : {});
  meta.version = String(result.version);
  meta.note = "";
  writeDraft(file, meta, body);
  const permalink = `${BASE}/${kind === "fragment" ? "f" : "t"}/${meta.id}/`;
  console.log(`Published ${kind} v${result.version}: ${permalink}`);
  if (result.warning) console.warn(`warning: ${result.warning}`);
}

async function pull(file) {
  const { meta } = readDraft(file);
  if (!meta.id) fail(`${file} has no id yet; push it first`);
  const item = await request("GET", `/api/items/${meta.id}`);
  if (typeof item?.content_md !== "string") fail(`GET /api/items/${meta.id} returned no working copy`);
  writeDraft(file, meta, item.content_md);
  console.log(`Pulled working copy of ${meta.id} into ${path.relative(process.cwd(), file)}.`);
}

async function generate(file, all) {
  const { meta } = await push(file, { quiet: true });
  let { body } = readDraft(file);
  const scopes = tkScopes(body);
  if (!scopes.length) return console.log("No [TK]...[/TK] scopes in this draft.");
  let ran = 0;
  for (const [i, scope] of scopes.entries()) {
    if (scope.generated && !all) continue;
    process.stdout.write(`Generating scope ${i + 1}/${scopes.length}: ${scope.instruction.slice(0, 60) || "(no instruction)"} ... `);
    const result = await request("POST", `/api/items/${meta.id}/generate`, { scope: i });
    console.log(`done (${result.model})`);
    ran++;
  }
  if (!ran) return console.log("Every scope already has output. Use --all to regenerate.");
  // The studio splices each output into its working copy; pulling keeps the
  // file byte-identical to what will publish.
  await pull(file);
}

// Local drafts are searched in full; the studio's own search only matches the
// first ~70 characters of each item, but it also covers items written in the
// browser and items imported from subscriptions.
async function find(query) {
  const q = (query ?? "").toLowerCase();
  const seen = new Set();
  for (const file of walk(path.join(ROOT, "drafts")).filter((p) => p.endsWith(".md"))) {
    const { meta, body } = readDraft(file);
    if (!meta.id || !meta.version || meta.version === "0") continue;
    if (q && !body.toLowerCase().includes(q) && !meta.id.includes(q)) continue;
    seen.add(meta.id);
    const excerpt = body.replace(/^[>#\s]+/gm, "").replace(/\s+/g, " ").trim().slice(0, 70);
    console.log(`![[${meta.id}]]  v${meta.version}  [${meta.kind}, ${path.relative(ROOT, file)}]  ${excerpt}`);
  }
  const data = await request("GET", `/api/search?q=${encodeURIComponent(q)}`);
  for (const r of data.items ?? []) {
    if (!seen.has(r.id)) console.log(`![[${r.id}]]  v${r.version}  [${r.badge}]  ${r.excerpt}`);
    seen.add(r.id);
  }
  if (!seen.size) console.log("No published items match.");
}

function quote(corpusFile, opts) {
  const { meta, body } = readDraft(corpusFile);
  let passage;
  if (opts.lines) {
    // Line numbers count from the top of the file, as an editor shows them.
    const [a, b] = String(opts.lines).split("-").map(Number);
    if (!a) fail("--lines takes a range like 12-15");
    passage = readFileSync(corpusFile, "utf8").replace(/\r\n/g, "\n").split("\n").slice(a - 1, b || a).join("\n");
  } else if (opts.from) {
    const start = body.indexOf(opts.from);
    if (start < 0) fail(`"${opts.from}" not found in ${corpusFile}`);
    const endAt = opts.to ? body.indexOf(opts.to, start) : -1;
    if (opts.to && endAt < 0) fail(`"${opts.to}" not found after the start text`);
    passage = body.slice(start, opts.to ? endAt + opts.to.length : undefined);
    if (!opts.to) passage = passage.split(/\n\s*\n/)[0];
  } else {
    fail("quote needs --lines a-b or --from \"start text\" [--to \"end text\"]");
  }
  passage = passage.trim();
  const title = meta.title || path.basename(corpusFile, ".md");
  const where = meta.url ? `[*${title}*](${meta.url})` : `*${title}*`;
  const attribution = `— from ${where}${meta.date ? ` (${meta.date.slice(0, 4)})` : ""}`;
  const quoted = passage.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
  const content = `${quoted}\n\n${attribution}`;
  if (content.length > FRAGMENT_MAX) {
    fail(`that passage makes a ${content.length}-character fragment; the limit is ${FRAGMENT_MAX}. Choose a shorter span.`);
  }
  const slug = (opts.name || `${path.basename(corpusFile, ".md")}-${passage.slice(0, 30)}`)
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  const out = path.join(ROOT, "drafts", "quotes", `${slug}.md`);
  mkdirSync(path.dirname(out), { recursive: true });
  if (existsSync(out)) fail(`${path.relative(ROOT, out)} already exists`);
  writeDraft(out, { kind: "fragment", id: "", version: "0", note: "", source: path.relative(ROOT, corpusFile).replaceAll(path.sep, "/") }, content);
  console.log(`Wrote ${path.relative(ROOT, out)} (${content.length} characters).`);
  return out;
}

function newDraft(file, kind) {
  if (existsSync(file)) fail(`${file} already exists`);
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeDraft(file, { kind, id: "", version: "0", note: "" }, kind === "thread" ? "# Title\n\nWrite here." : "Write here.");
  console.log(`Started ${kind} draft ${file}.`);
}

async function settings(file) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  delete data.$note;
  await request("PATCH", "/api/settings", data);
  console.log(`Pushed ${Object.keys(data).length} settings from ${path.relative(process.cwd(), file)}.`);
}

function status(dir) {
  const files = walk(dir).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const { meta, body } = readDraft(f);
    if (!("kind" in meta)) continue;
    const state = !meta.id ? "local only" : meta.version && meta.version !== "0" ? `v${meta.version}` : "draft";
    const pending = tkScopes(body).filter((s) => !s.generated).length;
    console.log(`${(meta.kind || "?").padEnd(8)} ${state.padEnd(10)} ${(meta.id || "").padEnd(26)}  ${path.relative(ROOT, f)}${pending ? `  (${pending} TK pending)` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A stub is a thread declaring the one thing it responds to. An empty field
// sends nothing, so a stub set in the browser studio is left alone.
function stubOf(meta, kind) {
  const v = meta.stub_of;
  if (v === undefined || v === "") return undefined;
  if (kind !== "thread") fail("stub_of is only allowed on threads");
  if (v === "none") return null;
  return typeof v === "object" ? v : { url: v };
}

function tkScopes(md) {
  const scopes = [];
  for (const m of md.matchAll(/\[TK\]([\s\S]*?)\[\/TK\]/g)) {
    const eq = m[1].indexOf("[=]");
    scopes.push({ instruction: (eq < 0 ? m[1] : m[1].slice(0, eq)).trim(), generated: eq >= 0 });
  }
  return scopes;
}

function stripTk(md) {
  return md.replace(/\[TK\]([\s\S]*?)\[\/TK\]/g, (_, inner) => {
    const eq = inner.indexOf("[=]");
    return eq < 0 ? "" : inner.slice(eq + 3);
  });
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function flags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else out[key] = args[++i];
    } else out._.push(args[i]);
  }
  return out;
}

function need(file, cmd) {
  if (!file) fail(`usage: blyg ${cmd} <file>`);
  if (!existsSync(file)) fail(`${file} not found`);
  return file;
}

// ---------------------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2);
const f = flags(rest);

switch (cmd) {
  case "login":
    await login();
    break;
  case "push":
    await push(need(f._[0], "push"));
    break;
  case "publish":
    await publish(need(f._[0], "publish"), typeof f.note === "string" ? f.note : undefined);
    break;
  case "pull":
    await pull(need(f._[0], "pull"));
    break;
  case "generate":
    await generate(need(f._[0], "generate"), !!f.all);
    break;
  case "find":
    await find(f._.join(" "));
    break;
  case "quote": {
    const out = quote(need(f._[0], "quote"), f);
    if (f.publish) await publish(out);
    break;
  }
  case "new":
    if (!f._[0]) fail("usage: blyg new <file> [--kind fragment|thread]");
    newDraft(f._[0], f.kind === "fragment" ? "fragment" : "thread");
    break;
  case "settings":
    await settings(need(f._[0] ?? path.join(ROOT, "blyg.settings.json"), "settings"));
    break;
  case "status":
    status(f._[0] ?? path.join(ROOT, "drafts"));
    break;
  default:
    console.log(readFileSync(import.meta.filename, "utf8").split("\n").slice(1, 28).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    if (cmd && cmd !== "help") process.exit(1);
}
