// Extension 5 (optional): read-state sync. Per reading row, the highest
// version the owner has read, never lowered, so every write is idempotent.
//
// The table is created on first use rather than by a migration, because
// worker/migrations is the reference Worker's and is never edited here. It
// is named `ext_read_state` so a future upstream `read_state` table can't
// collide with it. Owner-only: no public surface reads it.

import { type Env, badRequest, json, readJson } from "./http.ts";

let ready: Promise<void> | null = null;

export function ensureReadState(env: Env): Promise<void> {
  ready ??= env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS ext_read_state (
         subscription_id TEXT NOT NULL,
         remote_id       TEXT NOT NULL,
         read_version    INTEGER NOT NULL,
         updated         TEXT NOT NULL,
         PRIMARY KEY (subscription_id, remote_id)
       )`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER IF NOT EXISTS ext_read_state_item_gone AFTER DELETE ON imported_items
       BEGIN DELETE FROM ext_read_state
             WHERE subscription_id = OLD.subscription_id AND remote_id = OLD.remote_id; END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER IF NOT EXISTS ext_read_state_sub_gone AFTER DELETE ON subscriptions
       BEGIN DELETE FROM ext_read_state WHERE subscription_id = OLD.id; END`,
    ),
  ]).then(
    () => undefined,
    (e) => {
      ready = null;
      throw e;
    },
  );
  return ready;
}

interface Mark {
  sub: string;
  remote_id: string;
  version: number;
}

/** Why an entry isn't a valid mark, or null when it is. */
export function markProblem(v: unknown): string | null {
  if (!v || typeof v !== "object") return "must be an object";
  const m = v as Record<string, unknown>;
  if (typeof m.sub !== "string" || !m.sub) return "sub must be a non-empty string";
  if (typeof m.remote_id !== "string" || !m.remote_id) return "remote_id must be a non-empty string";
  if (!Number.isInteger(m.version) || (m.version as number) < 0) return "version must be an integer ≥ 0";
  return null;
}

/** Store max(existing, version) for a row that exists; returns the stored value, or null for an unknown row. */
async function store(env: Env, m: Mark): Promise<number | null> {
  const known = await env.DB.prepare("SELECT 1 FROM imported_items WHERE subscription_id = ? AND remote_id = ?")
    .bind(m.sub, m.remote_id)
    .first();
  if (!known) return null;
  const row = await env.DB.prepare(
    `INSERT INTO ext_read_state (subscription_id, remote_id, read_version, updated) VALUES (?, ?, ?, ?)
     ON CONFLICT (subscription_id, remote_id) DO UPDATE SET
       read_version = MAX(read_version, excluded.read_version),
       updated = excluded.updated
     RETURNING read_version`,
  )
    .bind(m.sub, m.remote_id, m.version, new Date().toISOString())
    .first<{ read_version: number }>();
  return row?.read_version ?? null;
}

/** `PUT /api/reading/:sub/:remoteId/read {version}`. */
export async function putRead(req: Request, env: Env, sub: string, remoteId: string): Promise<Response> {
  const body = await readJson(req);
  const problem = markProblem({ ...body, sub, remote_id: remoteId });
  if (problem) return badRequest(problem);
  await ensureReadState(env);
  const stored = await store(env, { sub, remote_id: remoteId, version: body!.version as number });
  return json({ ok: true, stored: stored !== null, read_version: stored });
}

/** `POST /api/reading/read {items: [{sub, remote_id, version}]}`, at most 500; all or nothing on a 400. */
export async function postReads(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const items = body?.items;
  if (!Array.isArray(items)) return badRequest("items must be an array");
  if (items.length > 500) return badRequest("at most 500 items per call");
  const errors = items
    .map((it, index) => ({ index, reason: markProblem(it) }))
    .filter((e): e is { index: number; reason: string } => e.reason !== null);
  if (errors.length) return badRequest("malformed entries", errors);
  await ensureReadState(env);
  for (const it of items as Mark[]) await store(env, it);
  return json({ ok: true, received: items.length });
}
