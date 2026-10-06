# server-ext: owner-API extensions for Blygger Desktop

This folder is the Worker entry point (`main` in `wrangler.jsonc`). It wraps the untouched Blygger Studio release in `worker/` and adds the owner-only API that Blygger Desktop needs (`desktop/docs/SERVER.md`). Every public protocol surface and every studio and API route that this folder does not extend still goes to `worker/` unchanged, so nothing a reader or another blyg sees is different. The extensions below answer bearer-token callers only, which is Blygger Desktop. A cookie session, which is what the browser studio and the CLI use, always reaches the studio's own `/api`, because several of the extended paths (`GET /api/items`, `/api/settings`, `/api/reading`, and others) have different shapes there, and answering the studio in Desktop's shape leaves its item list paging forever.

| # | Extension | Where |
|---|---|---|
| 1 | `Authorization: Bearer <BLYG_OWNER_TOKEN>` is accepted wherever the studio cookie is. A valid bearer is turned into a signed session cookie on the forwarded request, so upstream routes accept it as they are. | `auth.ts` |
| 2 | `GET /api/items`, `GET /api/items/:id` (with `versions`), `GET /api/subscriptions` | `reads.ts` |
| 3 | `GET /api/reading?limit&before` (opaque keyset cursor), `GET /api/mentions`, `GET /api/settings` (public-safe fields only), `GET /api/hoppers`, and `show_responses` on items | `reads.ts`, `cursor.ts` |
| 4 | `GET`/`PUT /api/items/:id/tk-provenance`: text and position-keyed provenance written in one statement, validated first, never storing the instruction | `provenance.ts`, `provenance-check.ts` |
| 5 | Read-state sync: `read_state`/`read_version` on the reading list, `PUT /api/reading/:sub/:remoteId/read`, `POST /api/reading/read` | `readstate.ts` |
| 6 | Legacy writes that Studio 0.9 removed with no aliases (`PUT /api/items/:id`, `POST /api/fork`, `POST /api/items/:id/pin`, `PUT /api/settings`, and the rest of the table in `worker/docs/upgrading-to-0.11.md`) are rewritten into their replacements, so Blygger Desktop keeps working. | `compat.ts` |
| + | `POST /api/media` de-duplicates identical bytes on the same item; `DELETE /api/media/:id` removes an attachment (409 for the avatar or a file a pinned version uses) | `media.ts` |

Extension 5's table, `ext_read_state`, is created on first use rather than by a migration, because `worker/migrations` belongs to Blygger Studio. The `ext_` prefix keeps it from colliding with a future upstream `read_state` table.

## Turning it on

Set the token the desktop app will use, once:

```bash
npx wrangler secret put BLYG_OWNER_TOKEN   # a long random string; paste the same value into the app
```

Without it, bearer auth is off and everything else behaves exactly as before.

## Testing

`npm test` runs the reference Worker's suite and this folder's unit tests. The real acceptance test is Blygger Desktop's own end-to-end suite, which drives the Rust client against two local copies of this Worker. Run it from a checkout of the Windows app, [burrow-blyg-windows-](https://github.com/patwater/burrow-blyg-windows-), pointing it at this repository:

```bash
cd burrow-blyg-windows-
BLYG_WORKER_DIR=../pioneering-spirit-blyg bash scripts/e2e-local.sh
```

As of Blygger Studio 0.26.0, 20 of its 22 tests pass. The two that fail encode image behaviour that Studio 0.11.0 changed on purpose (its changelog: items now publish absolute image URLs, and relative ones in imported items resolve against the source blyg), so they need updating in the Windows app's repository rather than fixing here:

- `pasted_images_render_once_inline` asserts that a relative `media/…` image 404s on the published page, and it now resolves with a 200.
- `reading_items_carry_the_published_html` expects relative `src` attributes in a reading item's HTML, and it now receives `src="http://…/media/….png"`.

`tk_output_with_dollar_patterns_publishes_verbatim`, which failed against the old reference Worker, passes now that upstream splices TK output with a function replacement.
