// Media extras Blygger Desktop uses when present (its docs/SERVER.md, "Also
// used when present"): identical bytes on the same item upload once, and an
// abandoned attachment can be removed.

import { getMedia, getSettings, listMediaForItem } from "../../worker/src/model.ts";
import { type Env, json } from "./http.ts";

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `POST /api/media` with an `item_id` whose attachments already include the
 * same bytes → `200 {id, url, mime, duplicate: true}` and nothing stored.
 * Otherwise null: the reference Worker handles the upload.
 */
export async function duplicateUpload(req: Request, env: Env): Promise<Response | null> {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const itemId = form?.get("item_id");
  if (!file || typeof file === "string" || typeof itemId !== "string" || !itemId) return null;
  const want = await sha256(await file.arrayBuffer());
  for (const m of await listMediaForItem(env.DB, itemId)) {
    const obj = await env.MEDIA.get(m.r2_key);
    if (obj && (await sha256(await obj.arrayBuffer())) === want) {
      return json({ id: m.id, url: m.r2_key, mime: m.mime, duplicate: true });
    }
  }
  return null;
}

/**
 * `DELETE /api/media/:id` → `{ok: true}`; 404 for an unknown id; 409 for the
 * avatar, and for a file a pinned version references (a pin promises its
 * bytes forever, spec §8 rule 4).
 */
export async function deleteMedia(env: Env, id: string): Promise<Response> {
  const media = await getMedia(env.DB, id);
  if (!media) return json({ error: "not found" }, 404);
  if ((await getSettings(env.DB)).avatar_media_id === id) {
    return json({ error: "this is the site avatar; choose another avatar first" }, 409);
  }
  const pinned = await env.DB.prepare(
    "SELECT 1 FROM versions WHERE pinned = 1 AND (instr(content_md, ?) > 0 OR instr(content_html, ?) > 0) LIMIT 1",
  )
    .bind(media.r2_key, media.r2_key)
    .first();
  if (pinned) return json({ error: "a pinned version uses this file, and pins are permanent" }, 409);
  await env.MEDIA.delete(media.r2_key);
  await env.DB.prepare("DELETE FROM media WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
