// Extension 3: the reading list's opaque keyset cursor. It encodes the last
// row's (observed_at, subscription_id, remote_id); clients pass it back
// verbatim as `before`.

export type Cursor = [string, string, string];

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeCursor(c: Cursor): string {
  return b64url(JSON.stringify(c));
}

/** null for anything that isn't a cursor this server made. */
export function decodeCursor(s: string): Cursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const v = JSON.parse(unb64url(s));
    return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "string") ? (v as Cursor) : null;
  } catch {
    return null;
  }
}

/** `limit`: default 100, clamped to 1..500. */
export function readingLimit(raw: string | null): number {
  const n = raw === null ? 100 : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 100;
  return Math.min(500, Math.max(1, n));
}
