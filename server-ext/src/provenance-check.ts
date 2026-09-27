// Extension 4's shape checks, kept free of Worker imports so they can be
// unit-tested directly (test/pure.test.ts).

export interface Entry {
  model: string;
  sources: { id: string; version?: number }[];
  at?: string;
}

export type Checked = { ok: true; entries: (Entry | null)[] } | { ok: false; errors: { index: number; reason: string }[] };

/** Shape checks for `scopes`, before anything touches the database. */
export function checkScopes(raw: unknown): Checked {
  if (!Array.isArray(raw)) return { ok: false, errors: [{ index: -1, reason: "scopes must be an array" }] };
  const errors: { index: number; reason: string }[] = [];
  const entries = raw.map((e, i): Entry | null => {
    if (e === null) return null;
    if (!e || typeof e !== "object") {
      errors.push({ index: i, reason: "must be an object or null" });
      return null;
    }
    const o = e as Record<string, unknown>;
    if ("index" in o && o.index !== i) errors.push({ index: i, reason: `index must be ${i}` });
    if (typeof o.model !== "string" || !o.model.trim()) errors.push({ index: i, reason: "model must be a non-empty string" });
    if (o.at !== undefined && (typeof o.at !== "string" || Number.isNaN(Date.parse(o.at)))) {
      errors.push({ index: i, reason: "at must be an ISO-8601 time" });
    }
    const sources: Entry["sources"] = [];
    if (o.sources !== undefined) {
      if (!Array.isArray(o.sources)) errors.push({ index: i, reason: "sources must be an array" });
      else
        for (const s of o.sources) {
          const so = s as Record<string, unknown> | null;
          if (!so || typeof so.id !== "string") {
            errors.push({ index: i, reason: "each source needs an id" });
            continue;
          }
          if (so.version !== undefined && so.version !== null && (!Number.isInteger(so.version) || (so.version as number) < 1)) {
            errors.push({ index: i, reason: `source ${so.id}: version must be a positive integer` });
            continue;
          }
          sources.push({ id: so.id, ...(typeof so.version === "number" ? { version: so.version } : {}) });
        }
    }
    return { model: String(o.model ?? "").trim(), sources, ...(typeof o.at === "string" ? { at: o.at } : {}) };
  });
  return errors.length ? { ok: false, errors } : { ok: true, entries };
}
