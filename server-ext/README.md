# server-ext: owner-API extensions for Blygger Desktop

This folder is the Worker entry point (`main` in `wrangler.jsonc`). It wraps the untouched reference client in `worker/` and adds the owner-only API that Blygger Desktop needs (`desktop/docs/SERVER.md`). Every public protocol surface and every existing studio and API route still goes to `worker/` unchanged, so nothing a reader or another blyg sees is different.

| # | Extension | Where |
|---|---|---|
| 1 | `Authorization: Bearer <BLYG_OWNER_TOKEN>` is accepted wherever the studio cookie is. A valid bearer is turned into a signed session cookie on the forwarded request, so upstream routes accept it as they are. | `auth.ts` |
| 2 | `GET /api/items`, `GET /api/items/:id` (with `versions`), `GET /api/subscriptions` | `reads.ts` |
| 3 | `GET /api/reading?limit&before` (opaque keyset cursor), `GET /api/mentions`, `GET /api/settings` (public-safe fields only), `GET /api/hoppers`, and `show_responses` on items | `reads.ts`, `cursor.ts` |
| 4 | `GET`/`PUT /api/items/:id/tk-provenance`: text and position-keyed provenance written in one statement, validated first, never storing the instruction | `provenance.ts`, `provenance-check.ts` |
| 5 | Read-state sync: `read_state`/`read_version` on the reading list, `PUT /api/reading/:sub/:remoteId/read`, `POST /api/reading/read` | `readstate.ts` |
| + | `POST /api/media` de-duplicates identical bytes on the same item; `DELETE /api/media/:id` removes an attachment (409 for the avatar or a file a pinned version uses) | `media.ts` |

Extension 5's table, `ext_read_state`, is created on first use rather than by a migration, because `worker/migrations` belongs to the reference Worker. The `ext_` prefix keeps it from colliding with a future upstream `read_state` table.

## Turning it on

Set the token the desktop app will use, once:

```bash
npx wrangler secret put BLYG_OWNER_TOKEN   # a long random string; paste the same value into the app
```

Without it, bearer auth is off and everything else behaves exactly as before.

## Testing

`npm test` runs the reference Worker's suite and this folder's unit tests. The real acceptance test is Blygger Desktop's own end-to-end suite, which drives the Rust client against two local copies of this Worker:

```bash
cd desktop
BLYG_WORKER_DIR=.. bash scripts/e2e-local.sh
```

As of the import, 21 of its 22 tests pass. The one failure, `tk_output_with_dollar_patterns_publishes_verbatim`, is a bug in the reference Worker, not here: `worker/src/tk.ts` line 247 splices generated HTML with `out.replace(token, blockHtml)`, so `$&`, `` $` ``, `$'`, or `$$` inside AI-generated text are read as replacement patterns. The fix is `out.replace(token, () => blockHtml)`; it belongs upstream in `blygger/blygger-spec`, and arrives here through `npm run upgrade-worker`.
