// Extension 4: client-recorded TK provenance.
//
// When Blygger Desktop generates a `[TK]` span itself, it records who
// generated it here, so the next publish discloses the span (`generated` in
// the item document, `blyg-tk-gen` in the HTML) exactly as if the Worker had
// generated it. The Worker keys provenance by scope POSITION, so the client
// sends the working copy and the whole position-keyed array together, and
// this writes both in one statement. It never stores the instruction.

import { getItem } from "../../worker/src/model.ts";
import { parseScopes } from "../../worker/src/tk.ts";
import { resolveFragment } from "../../worker/src/transclusion.ts";
import type { ScopeProvenance } from "../../worker/src/types.ts";
import { type Env, badRequest, json, notFound, parseJson, readJson } from "./http.ts";
import { checkScopes } from "./provenance-check.ts";

/** `GET /api/items/:id/tk-provenance` → `{scopes}`. */
export async function getProvenance(env: Env, id: string): Promise<Response> {
  const item = await getItem(env.DB, id);
  if (!item) return notFound();
  const scopes = parseJson<unknown[]>(item.tk_provenance_json);
  return json({ scopes: Array.isArray(scopes) ? scopes : [] });
}

/** `PUT /api/items/:id/tk-provenance {content_md?, scopes}` → `{ok, disclosed}`. */
export async function putProvenance(req: Request, env: Env, id: string): Promise<Response> {
  const item = await getItem(env.DB, id);
  if (!item) return notFound();
  const body = await readJson(req);
  if (!body) return badRequest("JSON body required");
  if (body.content_md !== undefined && typeof body.content_md !== "string") return badRequest("content_md must be a string");
  const checked = checkScopes(body.scopes);
  if (!checked.ok) return badRequest("invalid scopes", checked.errors);

  const text = (body.content_md as string | undefined) ?? item.content_md;
  const parsed = parseScopes(text);
  if (parsed.errors.length) return badRequest("the working copy has malformed TK scopes", parsed.errors);
  if (checked.entries.length !== parsed.scopes.length) {
    return badRequest(`scopes has ${checked.entries.length} entries; the working copy has ${parsed.scopes.length} TK scopes`);
  }

  // Sources are this blyg's published fragments, recorded at an exact version.
  const errors: { index: number; reason: string }[] = [];
  const stored: (ScopeProvenance | null)[] = [];
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  for (const [index, e] of checked.entries.entries()) {
    if (!e) {
      stored.push(null);
      continue;
    }
    const sources: ScopeProvenance["sources"] = [];
    for (const s of e.sources) {
      const r = await resolveFragment(env.DB, s.id);
      if (!r.ok) {
        errors.push({ index, reason: `source ${s.id}: ${r.reason}` });
        continue;
      }
      if (s.version !== undefined && s.version > r.version.version) {
        errors.push({ index, reason: `source ${s.id}: version ${s.version} was never published` });
        continue;
      }
      sources.push({ id: s.id, version: s.version ?? r.version.version });
    }
    stored.push({ sources, model: e.model, at: e.at ?? now });
  }
  if (errors.length) return badRequest("unresolvable sources", errors);

  const provJson = JSON.stringify(stored);
  if (body.content_md !== undefined) {
    // The same working-copy semantics as upstream saveWorkingCopy, plus the
    // provenance, in one statement.
    await env.DB.prepare(
      `UPDATE items SET content_md = ?, dirty = 1, tk_provenance_json = ?,
         updated = CASE WHEN version = 0 THEN ? ELSE updated END
       WHERE id = ?`,
    )
      .bind(text, provJson, now, id)
      .run();
  } else {
    await env.DB.prepare("UPDATE items SET tk_provenance_json = ? WHERE id = ?").bind(provJson, id).run();
  }
  return json({ ok: true, disclosed: stored.filter((s) => s !== null).length });
}
