// Legacy owner-API writes, translated to the studio's resource-shaped /api.
//
// Blygger Studio 0.9 removed several /api routes with no aliases (see
// worker/docs/upgrading-to-0.11.md, "For tool authors"). Blygger Desktop was
// built against the earlier routes, so this rewrites each of them into its
// replacement before the request reaches the studio. A request that matches
// none of these passes through untouched, so the studio's own routes keep
// working for everything else.
//
// Only the request is translated. The replacements answer with the same
// fields the old routes did where Desktop reads them (`id` on create,
// `already` on pin), so responses are returned as they are.

type Body = Record<string, unknown>;
interface Rewrite {
  method: string;
  path: string;
  body?: Body;
}
type Rule = [method: string, pattern: RegExp, build: (params: string[], body: Body) => Rewrite | null];

const seg = "([^/]+)";
const at = (re: string) => new RegExp(`^${re}$`);

const rules: Rule[] = [
  // Saving a working copy is a PATCH now; only the fields sent change.
  ["PUT", at(`/api/items/${seg}`), ([id], body) => ({ method: "PATCH", path: `/api/items/${id}`, body })],
  // `{show: boolean}` became the three-way `responses` field.
  [
    "PUT",
    at(`/api/items/${seg}/responses`),
    ([id], body) =>
      typeof body.show === "boolean"
        ? { method: "PATCH", path: `/api/items/${id}`, body: { responses: body.show ? "show" : "hide" } }
        : null,
  ],
  [
    "POST",
    at(`/api/items/${seg}/pin`),
    ([id], body) =>
      Number.isInteger(body.version) ? { method: "PUT", path: `/api/items/${id}/versions/${body.version}/pin` } : null,
  ],
  [
    "POST",
    at("/api/fork"),
    (_p, { origin, id, version }) => ({
      method: "POST",
      path: "/api/items",
      body: { mode: "fork", source: { origin, id, version } },
    }),
  ],
  [
    "POST",
    at("/api/stubs"),
    (_p, { subscription_id, remote_id, selection }) => ({
      method: "POST",
      path: "/api/items",
      body: { mode: "response", source: { subscription_id, remote_id }, ...(selection !== undefined ? { selection } : {}) },
    }),
  ],
  ["PUT", at(`/api/subscriptions/${seg}`), ([id], body) => ({ method: "PATCH", path: `/api/subscriptions/${id}`, body })],
  [
    "POST",
    at(`/api/subscriptions/${seg}/(pause|resume)`),
    ([id, action]) => ({ method: "PATCH", path: `/api/subscriptions/${id}`, body: { paused: action === "pause" } }),
  ],
  ["PUT", at(`/api/hoppers/${seg}`), ([id], body) => ({ method: "PATCH", path: `/api/hoppers/${id}`, body })],
  ["PUT", at(`/api/mentions/${seg}/hidden`), ([id], body) => ({ method: "PATCH", path: `/api/mentions/${id}`, body })],
  ["PUT", at("/api/settings"), (_p, body) => ({ method: "PATCH", path: "/api/settings", body })],
];

/** The studio-shaped request for a legacy one, or the original if it isn't legacy. */
export async function translateLegacy(req: Request): Promise<Request> {
  const url = new URL(req.url);
  for (const [method, pattern, build] of rules) {
    if (req.method !== method) continue;
    const hit = pattern.exec(url.pathname);
    if (!hit) continue;
    const body = (await req
      .clone()
      .json()
      .catch(() => ({}))) as Body;
    const rewrite = build(hit.slice(1).map(decodeURIComponent), body && typeof body === "object" ? body : {});
    // A body the old route would have rejected is left as it was, so the studio
    // answers it with its own error rather than this layer inventing one.
    if (!rewrite) return req;
    url.pathname = rewrite.path;
    const headers = new Headers(req.headers);
    headers.delete("content-length");
    // A rewrite with no body must not keep the original's content type, or
    // the studio would try to parse an empty JSON body.
    if (rewrite.body) headers.set("content-type", "application/json");
    else headers.delete("content-type");
    return new Request(url, {
      method: rewrite.method,
      headers,
      body: rewrite.body ? JSON.stringify(rewrite.body) : undefined,
    });
  }
  return req;
}
