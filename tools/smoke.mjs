#!/usr/bin/env node
// Smoke test for a running blyg: does the studio's own contract still hold
// next to server-ext's Desktop-shaped routes?
//
//   BLYG_URL=http://localhost:8787 BLYG_PASSWORD=dev [BLYG_OWNER_TOKEN=dev-token] npm run smoke
//
// It exists because the unit tests cannot see the way server-ext and the
// studio share /api paths. Once, server-ext answered the browser studio's
// paged `GET /api/items` in Desktop's shape (no `total`), and the studio paged
// forever and rendered a blank page with every test green. These checks read
// the same routes the studio's page loads, as the studio does (cookie session),
// and as Blygger Desktop does (bearer token).
//
// It only reads. It is safe to run against the live site after a deploy.

const BASE = (process.env.BLYG_URL ?? "http://localhost:8787").replace(/\/+$/, "");
const PASSWORD = process.env.BLYG_PASSWORD;
const TOKEN = process.env.BLYG_OWNER_TOKEN;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
  if (!ok) failures++;
};

async function json(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {}
  return { res, text, body };
}

// Public surface.
const manifest = await json("/blyg.json");
check("blyg.json answers", manifest.res.status === 200, `HTTP ${manifest.res.status}`);
check("blyg.json names the studio generator", String(manifest.body?.generator).startsWith("blygger-studio/"), manifest.body?.generator);
console.log(`      generator: ${manifest.body?.generator}`);

// The studio, as a browser sees it: a cookie session.
if (!PASSWORD) {
  console.log("skip  studio and API checks (set BLYG_PASSWORD to run them)");
} else {
  const login = await fetch(`${BASE}/studio/login`, { method: "POST", body: new URLSearchParams({ password: PASSWORD }), redirect: "manual" });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  check("studio login", login.status === 302 && !!cookie, `HTTP ${login.status}`);
  if (cookie) {
    const shell = await fetch(`${BASE}/studio/`, { headers: { cookie }, redirect: "manual" });
    const html = await shell.text();
    check("studio shell loads its app bundle", shell.status === 200 && html.includes("app.js"), `HTTP ${shell.status}`);
    const app = await fetch(`${BASE}/studio/app.js`, { headers: { cookie } });
    check("studio app.js is served", app.status === 200 && (app.headers.get("content-type") ?? "").includes("javascript"), `HTTP ${app.status}`);

    // The studio pages this list with offset and limit until it reaches
    // `total`. Without all three numbers it never stops.
    const items = await json("/api/items?offset=0&limit=100", { cookie });
    const b = items.body;
    check(
      "cookie GET /api/items is the studio's paged shape",
      items.res.status === 200 && Array.isArray(b?.items) && [b?.total, b?.offset, b?.limit].every(Number.isFinite),
      `HTTP ${items.res.status}, keys ${Object.keys(b ?? {}).join(",")}`,
    );
    check("studio item list is not larger than its page", Array.isArray(b?.items) && b.items.length <= 100, `${b?.items?.length} items for limit 100`);
  }
}

// Blygger Desktop: a bearer token and its own shapes.
if (!TOKEN) {
  console.log("skip  Desktop checks (set BLYG_OWNER_TOKEN to run them)");
} else {
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const items = await json("/api/items", auth);
  check("bearer GET /api/items is Desktop's shape", items.res.status === 200 && Array.isArray(items.body?.items), `HTTP ${items.res.status}`);
  const subs = await json("/api/subscriptions", auth);
  check("bearer GET /api/subscriptions is Desktop's shape", subs.res.status === 200 && Array.isArray(subs.body?.subscriptions), `HTTP ${subs.res.status}`);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
