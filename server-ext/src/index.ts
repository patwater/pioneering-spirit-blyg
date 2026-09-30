// The Pioneering Spirit Worker: the Blygger reference client (worker/,
// never edited) plus the owner-API extensions Blygger Desktop needs
// (docs/SERVER.md in Blygger Desktop):
//
//   1. bearer-token owner auth (BLYG_OWNER_TOKEN)          auth.ts
//   2. owner JSON reads: items, one item, subscriptions    reads.ts
//   3. reading, mentions, settings, hoppers                reads.ts
//   4. client-recorded TK provenance                       provenance.ts
//   5. read-state sync (optional)                          readstate.ts
//   +  media de-duplication and removal                   media.ts
//
// Everything else, including every public protocol surface, goes to the
// reference Worker unchanged. The extensions only add owner-only /api
// routes; nothing here changes what a reader or another blyg sees.

import reference from "../../worker/src/index.ts";
import { authenticate, withSession } from "./auth.ts";
import { type Env, json } from "./http.ts";
import { deleteMedia, duplicateUpload } from "./media.ts";
import { getProvenance, putProvenance } from "./provenance.ts";
import { hoppers, listItems, listSubscriptions, mentions, oneItem, reading, settings } from "./reads.ts";
import { postReads, putRead } from "./readstate.ts";

type Handler = (req: Request, env: Env, params: string[]) => Promise<Response | null>;

const seg = "([^/]+)";
const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/api\/items$/, (req, env) => listItems(req, env)],
  ["GET", new RegExp(`^/api/items/${seg}$`), (req, env, [id]) => oneItem(req, env, id)],
  ["GET", new RegExp(`^/api/items/${seg}/tk-provenance$`), (_req, env, [id]) => getProvenance(env, id)],
  ["PUT", new RegExp(`^/api/items/${seg}/tk-provenance$`), (req, env, [id]) => putProvenance(req, env, id)],
  ["GET", /^\/api\/subscriptions$/, (_req, env) => listSubscriptions(env)],
  ["GET", /^\/api\/reading$/, (req, env) => reading(req, env)],
  ["PUT", new RegExp(`^/api/reading/${seg}/${seg}/read$`), (req, env, [sub, rid]) => putRead(req, env, sub, rid)],
  ["POST", /^\/api\/reading\/read$/, (req, env) => postReads(req, env)],
  ["GET", /^\/api\/mentions$/, (_req, env) => mentions(env)],
  ["GET", /^\/api\/settings$/, (_req, env) => settings(env)],
  ["GET", /^\/api\/hoppers$/, (_req, env) => hoppers(env)],
  ["DELETE", new RegExp(`^/api/media/${seg}$`), (_req, env, [id]) => deleteMedia(env, id)],
  // Falls through (null) to the reference upload unless it's a duplicate.
  ["POST", /^\/api\/media$/, (req, env) => duplicateUpload(req.clone(), env)],
];

function match(method: string, path: string): { handler: Handler; params: string[] } | null {
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const hit = re.exec(path);
    if (hit) return { handler, params: hit.slice(1).map(decodeURIComponent) };
  }
  return null;
}

async function fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (!path.startsWith("/api/")) return reference.fetch(req, env, ctx);

  const auth = await authenticate(req, env);
  if (auth === "bad-bearer") {
    // Say when the blyg has no token at all: the usual cause is a deploy
    // that dropped BLYG_OWNER_TOKEN, and "wrong token" would mislead.
    const reason = env.BLYG_OWNER_TOKEN ? undefined : "BLYG_OWNER_TOKEN is not set on this blyg";
    return json(reason ? { error: "unauthorized", reason } : { error: "unauthorized" }, 401);
  }
  const route = match(req.method, path);
  if (route) {
    if (auth === "none") return json({ error: "unauthorized" }, 401);
    const res = await route.handler(req, env, route.params);
    if (res) return res;
  }
  // The reference Worker's own /api routes, with a bearer turned into the
  // owner session it expects. That session is signed with COOKIE_SECRET; say
  // so plainly if it's missing rather than crash on an empty HMAC key.
  if (auth === "bearer" && !env.COOKIE_SECRET) {
    return json({ error: "COOKIE_SECRET is not set on this blyg; add it as a Secret in Cloudflare" }, 500);
  }
  return reference.fetch(auth === "bearer" ? await withSession(req, env) : req, env, ctx);
}

export default {
  fetch,
  scheduled: reference.scheduled,
} satisfies ExportedHandler<Env>;
