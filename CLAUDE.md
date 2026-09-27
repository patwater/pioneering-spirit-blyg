# Pioneering Spirit blyg: the writing room

This repo is two things at once. It deploys Patrick Atwater's blyg at the root of pioneeringspirit.xyz, and it is the room where he drafts in conversation with his own corpus. Most sessions here are writing sessions, not coding sessions.

## Ground rules

- **Never edit `worker/`.** It is a verbatim copy of the Blygger reference client (pinned in `upstream.json`) and is replaced wholesale by `npm run upgrade-worker`. Anything deployment-specific belongs in `wrangler.jsonc`, `blyg.settings.json`, or `tools/`.
- **Never publish without an explicit request.** Publishing is public and permanent in spirit: an item can be withdrawn but never deleted, and the feed notifies subscribers at once. `push` (saving a studio draft) is fine whenever it helps; `publish` and `quote --publish` need Patrick to say so in the current conversation.
- **Commit and push directly to `main`.** Patrick has authorized this for this repo. Every push to `main` deploys to the live site through Cloudflare Workers Builds, so run `npm test` before pushing any change to `worker/`, `wrangler.jsonc`, or `tools/build-archive.mjs`.
- **Never pin a version unless asked.** A pin is an irrevocable promise to host those bytes forever.
- Patrick prefers full sentences and full paragraphs in everything written for him. Avoid sentence fragments, verbless sentences, and one-line paragraphs.

## How writing works

A draft is a Markdown file under `drafts/` with front matter:

```markdown
---
kind: thread        # or fragment (1,000 characters max once published)
id:                 # filled in by push; never invent or edit one
version: 0          # filled in by publish
note:               # optional version note for the next publish
---
```

The authoring grammar, which the studio resolves at publish time:

- `![[id]]` alone on its own line in a **thread** transcludes a published item (a fragment or another thread, his own or one imported from a subscribed blyg). The published thread bakes in a snapshot of that item's current version.
- `[TK]an instruction[/TK]` asks the studio's AI to write that span. `npm run blyg -- generate <file>` fills it as `[TK]instruction[=]output[/TK]`, and publishing strips it to the output with a machine-generated provenance record. Inside a TK scope, `![[id]]` names a source for the generator rather than a quote, and it must be one of his own published **fragments**. That constraint is why corpus passages get quoted in as fragments first.
- Fragments cannot transclude; only threads can.

The CLI (`npm run blyg -- <command>`):

| Command | Use |
|---|---|
| `new drafts/x.md [--kind fragment]` | Start a draft file |
| `push drafts/x.md` | Save to the studio as a draft; assigns the id |
| `generate drafts/x.md [--all]` | Run ungenerated TK scopes and pull the result back |
| `publish drafts/x.md [--note "..."]` | Publish the next version (**only when asked**) |
| `pull drafts/x.md` | Bring edits made in the browser studio back into the file |
| `find <words>` | Look up ids to transclude |
| `quote corpus/... --from "..." [--to "..."]` | Turn a corpus passage into a fragment draft |
| `status` | List drafts, ids, versions, and pending TK scopes |
| `settings` | Push `blyg.settings.json` to the studio |

The CLI needs `BLYG_PASSWORD` (or a prompt) and reaches `https://pioneeringspirit.xyz` unless `BLYG_URL` says otherwise. In a cloud session, the environment's network policy must allow `pioneeringspirit.xyz`; if it does not, write the draft file anyway and tell Patrick which command to run.

## Drafting in dialogue with the corpus

`corpus/` holds the Paragraph archive, *A New California Dream*, the Stag Hunt material, and other writing (see `corpus/README.md`). When Patrick asks for help with a piece:

1. Read the relevant corpus files and find the passages the new piece is actually in conversation with. Prefer his own earlier words over summaries of them.
2. Propose which passages to quote in. Each becomes a fragment via `quote`, which is also what makes it usable as a TK source.
3. Draft the thread with those fragments transcluded where the argument turns on them, and write the connective prose in his voice. Use `[TK]` scopes only where he wants the studio's AI to write a span with disclosed provenance, rather than having the prose drafted here.
4. Use the `pioneering-spirit-blog`, `world-machine-blog`, `california-counts`, or `stag-hunt` skills when they are available and the piece fits them.

A good fragment is a single idea, stated completely, that could be quoted on its own. A good thread is an essay whose load-bearing passages are fragments, so that each can later be quoted by other threads and by other people's blygs.

## Operations

- `npm install` installs both the root tooling and `worker/`.
- `npm test` runs the upstream suite; it must stay green after `npm run upgrade-worker`.
- `npm run dev` serves the blyg locally at http://localhost:8787 (put `OWNER_PASSWORD` and `COOKIE_SECRET` in `.dev.vars`, and run `npm run migrate:local` once).
- `npm run deploy` builds `archive-site/` from `corpus/paragraph/` and deploys; `npm run migrate` applies new D1 migrations remotely.
- The README has the full provisioning and domain-cutover runbook.
