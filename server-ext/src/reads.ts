// Extensions 2 and 3: owner JSON reads. The reference Worker renders these
// lists only as studio HTML; a native client needs them as JSON. Shapes
// follow Blygger Desktop's `docs/SPEC.md` § API and `blyg-core` model types.

import { authoredKind, getItem, getSettings } from "../../worker/src/model.ts";
import { siteOrigin } from "../../worker/src/protocol.ts";
import type { ItemRow } from "../../worker/src/types.ts";
import { normalizeMount } from "../../worker/src/util.ts";
import { decodeCursor, encodeCursor, readingLimit } from "./cursor.ts";
import { type Env, badRequest, json, notFound, parseJson } from "./http.ts";
import { ensureReadState } from "./readstate.ts";

async function origin(env: Env, req: Request): Promise<string> {
  return siteOrigin(await getSettings(env.DB), req.url, normalizeMount(env.MOUNT));
}

async function wireItem(env: Env, item: ItemRow, base: string) {
  const kind = await authoredKind(env.DB, item);
  const row = item as ItemRow & { stub_of?: string | null; forked_from?: string | null };
  return {
    id: item.id,
    kind: item.kind,
    authored_kind: kind,
    status: item.status,
    version: item.version,
    dirty: item.dirty === 1,
    created: item.created,
    updated: item.updated,
    content_md: item.content_md,
    stub_of: parseJson(row.stub_of),
    forked_from: parseJson(row.forked_from),
    // No trailing slash: the form Blygger Desktop expects (the Worker serves both).
    permalink: item.version > 0 ? `${base}${kind === "thread" ? "t" : "f"}/${item.id}` : null,
    show_responses: item.show_responses === 1,
  };
}

/** `GET /api/items` → `{items}`, newest-updated first: drafts, public and withdrawn. */
export async function listItems(req: Request, env: Env): Promise<Response> {
  const base = await origin(env, req);
  const rows = (await env.DB.prepare("SELECT * FROM items ORDER BY updated DESC").all<ItemRow>()).results;
  return json({ items: await Promise.all(rows.map((r) => wireItem(env, r, base))) });
}

/** `GET /api/items/:id` → the item plus its `versions`. */
export async function oneItem(req: Request, env: Env, id: string): Promise<Response> {
  const item = await getItem(env.DB, id);
  if (!item) return notFound();
  const versions = (
    await env.DB.prepare(
      "SELECT version, published_at, note, pinned, content_md FROM versions WHERE item_id = ? ORDER BY version ASC",
    )
      .bind(id)
      .all<{ version: number; published_at: string; note: string | null; pinned: number; content_md: string }>()
  ).results.map((v) => ({
    version: v.version,
    published_at: v.published_at,
    note: v.note,
    pinned: v.pinned === 1,
    // A withdrawal endcap is the only version with no content (spec §9).
    endcap: v.content_md === "",
  }));
  return json({ ...(await wireItem(env, item, await origin(env, req))), versions });
}

/** `GET /api/subscriptions` → `{subscriptions}`. */
export async function listSubscriptions(env: Env): Promise<Response> {
  const rows = (
    await env.DB.prepare(
      "SELECT id, kind, origin, feed_url, title, status, in_blogroll FROM subscriptions ORDER BY created ASC",
    ).all<{
      id: string;
      kind: string;
      origin: string;
      feed_url: string;
      title: string;
      status: string;
      in_blogroll: number;
    }>()
  ).results;
  return json({ subscriptions: rows.map((r) => ({ ...r, in_blogroll: r.in_blogroll === 1 })) });
}

interface ReadingRow {
  subscription_id: string;
  remote_id: string;
  kind: string;
  state: string;
  version: number;
  created: string | null;
  updated: string | null;
  observed_at: string;
  content_md: string;
  content_html: string;
  author_json: string | null;
  transclusions_json: string | null;
  pinned_version_retained: number | null;
  page: string | null;
  subscription_title: string;
  origin: string;
  thumb: number | null;
  read_version: number | null;
}

/**
 * `GET /api/reading?limit&before` → `{items, next, read_state: true}`,
 * newest `observed_at` first, keyset-paged with an opaque cursor.
 */
export async function reading(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const limit = readingLimit(url.searchParams.get("limit"));
  const before = url.searchParams.get("before");
  const cursor = before === null ? null : decodeCursor(before);
  if (before !== null && !cursor) return badRequest("bad cursor");
  await ensureReadState(env);
  const where = cursor ? "WHERE (ii.observed_at, ii.subscription_id, ii.remote_id) < (?, ?, ?)" : "";
  const stmt = env.DB.prepare(
    `SELECT ii.subscription_id, ii.remote_id, ii.kind, ii.state, ii.version, ii.created, ii.updated,
            ii.observed_at, ii.content_md, ii.content_html, ii.author_json, ii.transclusions_json,
            ii.pinned_version_retained, ii.page,
            s.title AS subscription_title, s.origin AS origin,
            sg.thumb AS thumb, rs.read_version AS read_version
     FROM imported_items ii
     JOIN subscriptions s ON s.id = ii.subscription_id
     LEFT JOIN signals sg ON sg.subscription_id = ii.subscription_id AND sg.remote_id = ii.remote_id
     LEFT JOIN ext_read_state rs ON rs.subscription_id = ii.subscription_id AND rs.remote_id = ii.remote_id
     ${where}
     ORDER BY ii.observed_at DESC, ii.subscription_id DESC, ii.remote_id DESC
     LIMIT ?`,
  );
  const rows = (
    await (cursor ? stmt.bind(cursor[0], cursor[1], cursor[2], limit + 1) : stmt.bind(limit + 1)).all<ReadingRow>()
  ).results;
  const page = rows.slice(0, limit);
  const hopperRows = page.length
    ? (
        await env.DB.prepare("SELECT hopper_id, subscription_id, remote_id FROM hopper_items").all<{
          hopper_id: string;
          subscription_id: string;
          remote_id: string;
        }>()
      ).results
    : [];
  const hoppersOf = new Map<string, string[]>();
  for (const h of hopperRows) {
    const key = `${h.subscription_id}\u0000${h.remote_id}`;
    hoppersOf.set(key, [...(hoppersOf.get(key) ?? []), h.hopper_id]);
  }
  const items = page.map((r) => {
    const author = parseJson<{ name?: unknown; url?: unknown }>(r.author_json);
    const transclusions = parseJson<unknown[]>(r.transclusions_json);
    return {
      subscription_id: r.subscription_id,
      remote_id: r.remote_id,
      subscription_title: r.subscription_title,
      origin: r.origin,
      kind: r.kind === "thread" ? "thread" : "fragment",
      state: r.state,
      version: r.version,
      created: r.created,
      updated: r.updated,
      observed_at: r.observed_at,
      content_md: r.content_md ?? "",
      content_html: r.content_html ?? "",
      author:
        author && typeof author === "object"
          ? {
              name: typeof author.name === "string" ? author.name : null,
              url: typeof author.url === "string" ? author.url : null,
            }
          : null,
      page: r.page,
      thumb: r.thumb === 1 || r.thumb === -1 ? r.thumb : null,
      hoppers: hoppersOf.get(`${r.subscription_id}\u0000${r.remote_id}`) ?? [],
      ...(r.pinned_version_retained !== null ? { pinned_version_retained: r.pinned_version_retained } : {}),
      ...(Array.isArray(transclusions) && transclusions.length ? { transclusions } : {}),
      read_version: r.read_version,
    };
  });
  const last = page[page.length - 1];
  const next = rows.length > limit && last ? encodeCursor([last.observed_at, last.subscription_id, last.remote_id]) : null;
  return json({ items, next, read_state: true });
}

/** `GET /api/mentions` → `{mentions}`, newest first. */
export async function mentions(env: Env): Promise<Response> {
  const rows = (
    await env.DB.prepare(
      `SELECT id, target_item_id, status, relation, source, source_origin, source_id, source_kind,
              source_version, source_author_json, first_seen, verified_at, hidden
       FROM mentions_in ORDER BY first_seen DESC`,
    ).all<Record<string, unknown> & { source_author_json: string | null; hidden: number }>()
  ).results;
  return json({
    mentions: rows.map(({ source_author_json, hidden, ...m }) => ({
      ...m,
      source_author: parseJson(source_author_json),
      hidden: hidden === 1,
    })),
  });
}

/** `GET /api/settings` → the public-safe settings only (never AI keys or prompts). */
export async function settings(env: Env): Promise<Response> {
  const s = await getSettings(env.DB);
  return json({
    site_title: s.site_title,
    author_name: s.author_name,
    author_bio: s.author_bio,
    site_url: s.site_url,
    theme: s.theme,
    avatar_media_id: s.avatar_media_id,
    author_links: s.author_links,
  });
}

/** `GET /api/hoppers` → `{hoppers: [{id, name, slug, public, count}]}`. */
export async function hoppers(env: Env): Promise<Response> {
  const rows = (
    await env.DB.prepare(
      `SELECT h.id, h.name, h.slug, h.public, COUNT(hi.remote_id) AS count
       FROM hoppers h LEFT JOIN hopper_items hi ON hi.hopper_id = h.id
       GROUP BY h.id ORDER BY h.created ASC`,
    ).all<{ id: string; name: string; slug: string | null; public: number; count: number }>()
  ).results;
  return json({ hoppers: rows.map((h) => ({ ...h, public: h.public === 1 })) });
}
