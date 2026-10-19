// Extension 1: bearer-token owner auth.
//
// A native client can't hold the studio's cookie session cleanly, so
// `Authorization: Bearer <BLYG_OWNER_TOKEN>` is accepted wherever the owner
// cookie is. The wrapper translates a valid bearer into a freshly signed
// session cookie on the forwarded request, so every upstream /api route
// accepts it without changing a line of the reference Worker.
//
// Any other bearer is the studio's own (an OAuth grant or a manual API token,
// studio 0.28+). It is not ours to judge, so it reaches the studio untouched.

import { issueSessionCookie, verifySession } from "../../worker/src/auth.ts";
import type { Env } from "./http.ts";

export type Auth = "bearer" | "studio-bearer" | "cookie" | "none";

async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return (crypto.subtle as unknown as { timingSafeEqual(x: ArrayBuffer, y: ArrayBuffer): boolean }).timingSafeEqual(
    da,
    db,
  );
}

export async function authenticate(req: Request, env: Env): Promise<Auth> {
  const header = req.headers.get("Authorization");
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    const token = env.BLYG_OWNER_TOKEN;
    return token && (await sameSecret(bearer, token)) ? "bearer" : "studio-bearer";
  }
  return (await verifySession(env, req.headers.get("Cookie") ?? undefined)) ? "cookie" : "none";
}

/** The request with a valid owner session cookie added, for the upstream app. */
export async function withSession(req: Request, env: Env): Promise<Request> {
  const cookie = (await issueSessionCookie(env)).split(";")[0];
  const headers = new Headers(req.headers);
  headers.delete("Authorization");
  const existing = headers.get("Cookie");
  headers.set("Cookie", existing ? `${existing}; ${cookie}` : cookie);
  return new Request(req, { headers });
}
