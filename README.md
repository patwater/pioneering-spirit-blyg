# Pioneering Spirit, as a blyg

This repository runs [Pioneering Spirit](https://pioneeringspirit.xyz) as a [Blygger](https://github.com/blygger/blygger-spec) blyg at the root of pioneeringspirit.xyz, on Cloudflare. It replaces the earlier Paragraph-to-blyg sync. The blyg is now the home of new writing, and the Paragraph archive becomes a corpus to write in dialogue with, while every old post stays online at its original address.

## How the pieces fit

```
                         pioneeringspirit.xyz  (one Cloudflare Worker)
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  /  /f/{id}/  /t/{id}/  feed.xml  blyg.json  items/…   public blyg        │
  │  /studio  /api                                         private editor     │
  │  /{old-slug}/  /paragraph/                             static archive     │
  └──────────────────────────────────────────────────────────────────────────┘
        ▲                 ▲                          ▲
        │ D1 + R2         │ browser, phone,          │ built from corpus/paragraph
        │ (posts, media)  │ or `npm run blyg`        │ at deploy time
```

- `worker/` is a verbatim copy of the Blygger reference client (pinned in `upstream.json`). It provides the public blyg, the private **studio** editor at `/studio`, subscriptions to other blygs, transclusion, and TK (AI) generation. It is never edited here, so upgrades are a clean overwrite.
- `wrangler.jsonc` holds everything specific to this deployment: the root mount, the custom domain, the database, the media bucket, and the static archive.
- `blyg.settings.json` holds the site identity and the AI style prompt as code.
- `corpus/` is the library you write in dialogue with: the Paragraph export, *A New California Dream*, Stag Hunt, and anything else.
- `drafts/` holds pieces drafted in this repo, including sessions with Claude, which `npm run blyg` pushes to the studio.
- `tools/` holds the CLI, the Paragraph exporter, the archive builder, and the upgrade script.

## One-time setup

You need Node 22 or newer, a Cloudflare account, and the `pioneeringspirit.xyz` zone on Cloudflare. If the domain's nameservers currently point elsewhere, add the site to Cloudflare first and switch the nameservers at your registrar; Cloudflare imports the existing DNS records, so Paragraph keeps working in the meantime.

### 1. Install

```bash
npm install          # installs the root tooling and worker/
npm test             # the upstream suite (500+ tests) should pass
```

### 2. Provision Cloudflare

```bash
npx wrangler login
npx wrangler whoami                                   # copy your account id
npx wrangler d1 create pioneering-spirit-blyg         # copy the database_id it prints
npx wrangler r2 bucket create pioneering-spirit-blyg-media
```

Paste the account id and the database id over the two `REPLACE_WITH_…` placeholders in `wrangler.jsonc`, then create the schema:

```bash
npm run migrate
```

### 3. Set the secrets

Wrangler prompts for each value, so nothing lands in your shell history or in a file.

```bash
npx wrangler secret put OWNER_PASSWORD    # your studio login password
npx wrangler secret put COOKIE_SECRET     # any long random string
npx wrangler secret put AI_PROVIDER_KEY   # an Anthropic API key; optional, enables [TK] generation
```

### 4. Cut the domain over from Paragraph

Do these in order, ideally in one sitting, since the site is briefly unavailable between steps b and c.

1. **Export everything from Paragraph first.** Run the *Export Paragraph archive* action from the Actions tab (or `npm run export-paragraph` locally) and commit `corpus/paragraph/`. Separately, export your **email subscriber list** from Paragraph's dashboard, because a blyg has no newsletter of its own (see "Email subscribers" below).
2. **Detach the domain from Paragraph.** Remove the custom domain in Paragraph's settings, and delete the DNS records Paragraph had you create for `pioneeringspirit.xyz` in the Cloudflare dashboard.
3. **Deploy.** `npm run deploy` builds the archive and attaches `pioneeringspirit.xyz` as a Worker custom domain, which creates the DNS record and certificate automatically.
4. **Log in and push your settings.** `npm run blyg -- login`, then `npm run blyg -- settings`. You can also visit https://pioneeringspirit.xyz/studio.
5. **Redirect `www`.** In Cloudflare, add a redirect rule from `www.pioneeringspirit.xyz/*` to `https://pioneeringspirit.xyz/${1}` so the blyg has a single origin.
6. **Check the old links.** Any old post URL such as `https://pioneeringspirit.xyz/<slug>` should now show the archived copy, and `https://pioneeringspirit.xyz/paragraph/` lists them all.

If you want to rehearse before step 2, temporarily comment out the `routes` block in `wrangler.jsonc`, deploy, and try the `*.workers.dev` URL that Wrangler prints; then restore the block for the real cutover.

### 5. Automate deploys (optional)

Add a repository secret named `CLOUDFLARE_API_TOKEN`, created from the *Edit Cloudflare Workers* template, and make sure it also carries **D1: Edit** on the account (add it if the template does not include it), because the migration step fails without D1 access and the error reads misleadingly like a wrong-account problem. After that, every push to `main` that changes the Worker, its config, or the Paragraph corpus runs the tests, applies migrations, deploys, and verifies the live surfaces. Posts themselves never need a deploy, because they live in the database.

## Writing

There are three ways to write, and they all edit the same studio drafts.

**The browser studio** at `/studio` works on a laptop or a phone. It has a fragment composer, a thread editor with a `![[` picker for transclusion, a Generate button for `[TK]` scopes, version notes, pins, and the reading view for your subscriptions.

**Drafting in this repo** is the path for longer pieces and for writing with Claude, where the whole corpus is in context. A draft is a Markdown file with front matter, and the CLI moves it to and from the studio:

```bash
npm run blyg -- new drafts/2026-10-aqueduct-commons.md
npm run blyg -- quote corpus/book/03-aqueduct.md --from "The aqueduct was never" --publish
npm run blyg -- find aqueduct                      # ids to transclude with ![[id]]
npm run blyg -- push drafts/2026-10-aqueduct-commons.md
npm run blyg -- generate drafts/2026-10-aqueduct-commons.md
npm run blyg -- publish drafts/2026-10-aqueduct-commons.md --note "first version"
npm run blyg -- pull drafts/2026-10-aqueduct-commons.md   # after editing in the browser
npm run blyg -- status
```

Set `BLYG_PASSWORD` in your environment to skip the password prompt. `CLAUDE.md` explains the authoring grammar and the drafting workflow in detail, and it tells Claude never to publish unless you ask.

**Blygger Desktop** is a fast native client by Aneesh Sathe that syncs with the same studio. It is macOS-only today; see "A Windows client" below.

### The authoring grammar in brief

| You write | What happens |
|---|---|
| `![[id]]` alone on a line in a thread | The published thread bakes in a snapshot of that item, with provenance. |
| `[TK]instruction[/TK]` | Generate fills it with AI prose in your configured style; publish strips the instruction and discloses the span as machine-generated. |
| `[TK]… ![[id]] …[/TK]` | That fragment is a source the generator draws on, disclosed in provenance but not quoted. |

Fragments are capped at 1,000 characters and cannot transclude. Threads have no cap.

## Using the protocol well

A few habits make the most of what Blygger offers for this kind of writing.

- **Let fragments carry the ideas.** A fragment is a complete, quotable thought. When the load-bearing passages of an essay are fragments, each one can be transcluded into later threads, reused as a TK source, and quoted by other people's blygs. Your book and archive become a commonplace book of such fragments, one deliberate quotation at a time.
- **Treat threads as living essays.** Every edit publishes a new version and resurfaces in the feed as the latest rollup, so a thread can grow over months. Use version notes to say what changed.
- **Pin what should be citable.** A pin promises to serve one version forever, so reserve it for states worth citing, such as a finished chapter or a policy argument you expect others to quote.
- **Subscribe and respond.** The studio can subscribe to other blygs and plain RSS feeds (for example the Protocol Institute and Venkatesh Rao's blygs) and triage what arrives into private hoppers. A *stub* is the response gesture: your own thread that quotes theirs and notifies them by Webmention.
- **Publish a blogroll and public hoppers.** Choosing subscriptions to show in `blogroll.opml`, and making a hopper public as a curated page, are the protocol's discovery tools, and they suit water-policy reading lists well.

## Email subscribers

Paragraph readers who subscribed by email will not follow the move automatically. The simplest bridge is an RSS-to-email service (Buttondown, Kit, and Mailchimp all offer one) pointed at `https://pioneeringspirit.xyz/feed.xml`, seeded with the subscriber list you exported. Because the feed announces every new version, you may want the service to send a digest rather than one email per update.

## A Windows client

Blygger Desktop is written in Rust on GPUI and wry, both of which run on Windows, and most of its roughly 60,000 lines are platform-neutral. The macOS-specific parts are small: a few Objective-C calls for the dock icon and window focus, the Keychain backend for stored tokens, the `⌘` key bindings, the self-updater (which installs `.app` bundles), and the `.dmg` packaging. A Windows port would mean swapping those for Windows equivalents and adding an installer, which is likely a few focused days of work for someone comfortable with Rust, and it is best done as a contribution to the upstream project rather than as a fork. Until then the browser studio works on Windows as is.

## Keeping the reference client current

```bash
npm run upgrade-worker          # or: npm run upgrade-worker -- <commit or tag>
git diff --stat worker          # read migration and config changes closely
npm install && npm test
npm run migrate                 # only if worker/migrations gained files
npm run deploy
```

The protocol is pre-1.0, so upstream may change the wire format between versions. The upgrade script records the new commit in `upstream.json`.

## Local development

```bash
printf 'OWNER_PASSWORD=dev\nCOOKIE_SECRET=dev-secret\n' > .dev.vars
npm run migrate:local
npm run dev                                       # http://localhost:8787
BLYG_URL=http://localhost:8787 BLYG_PASSWORD=dev npm run blyg -- status
```

## Escape hatch

The whole public surface is static by design. The upstream `worker/scripts/export.ts` writes a byte-identical copy of the blyg to plain files, so the site can move to any static host if Cloudflare ever stops being the right home.
