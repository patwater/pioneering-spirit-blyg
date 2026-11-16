// One identity for the blyg: the public surface served at a retired address
// (the workers.dev one) answers with a permanent redirect to the canonical
// origin, so feed readers, the blygger.com directory and anyone resolving the
// old address converge on a single blyg instead of seeing two with the same
// item ids.
//
// Only public reads move. /api and /studio stay where they are, because a
// cross-origin redirect drops a client's Authorization header and cookies, and
// a write (a Webmention POST, a publish) is never redirected. The match is on
// the exact hostname, so Cloudflare's per-branch preview addresses, which end
// in the same workers.dev subdomain, keep serving their own build.

export interface RedirectEnv {
  /** The exact retired hostname, e.g. pioneering-spirit-blyg.example.workers.dev. Unset = no redirect. */
  REDIRECT_FROM_HOST?: string;
  /** The canonical origin, e.g. https://blyg.example.com. Unset = no redirect. */
  CANONICAL_ORIGIN?: string;
}

/** The canonical URL for `req`, or null when it should be served where it is. */
export function canonicalRedirect(method: string, url: URL, env: RedirectEnv): string | null {
  if (!env.REDIRECT_FROM_HOST || !env.CANONICAL_ORIGIN) return null;
  if (url.hostname !== env.REDIRECT_FROM_HOST) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  const p = url.pathname;
  if (p === "/api" || p.startsWith("/api/") || p === "/studio" || p.startsWith("/studio/")) return null;
  const target = new URL(env.CANONICAL_ORIGIN);
  if (target.hostname === url.hostname) return null;
  return target.origin + p + url.search;
}
