// Small helpers shared by the extension routes: JSON responses, safe body
// parsing, and the tagged Env the wrapper adds to the reference Worker's.

import type { Env as BaseEnv } from "../../worker/src/types.ts";

export interface Env extends BaseEnv {
  /** Owner bearer token for native clients (Blygger Desktop). Unset = bearer auth off. */
  BLYG_OWNER_TOKEN?: string;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const notFound = () => json({ error: "not found" }, 404);
export const badRequest = (error: string, errors?: unknown[]) =>
  json(errors ? { error, errors } : { error }, 400);

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await req.json();
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A stored JSON column, or null when absent or malformed. */
export function parseJson<T = unknown>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
