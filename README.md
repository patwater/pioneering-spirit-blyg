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
- `server-ext/` is the Worker's entry point: a thin wrapper that adds the owner API Blygger Desktop needs (bearer-token auth, JSON reads, reading list, AI provenance, read-state sync) and hands everything else to `worker/` unchanged. See `server-ext/README.md`.
- `desktop/` is Blygger Desktop, Aneesh Sathe's native reading-and-writing app, ported to Windows (pinned in `desktop-upstream.json`). See `desktop/WINDOWS.md`.
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
npx wrangler secret put BLYG_OWNER_TOKEN  # a long random string; the desktop app signs in with it
```

You can set the same secrets in the Cloudflare dashboard under the Worker's **Settings → Variables and Secrets**, as type **Secret**.

### 4. Cut the domain over from Paragraph

Do these in order, ideally in one sitting, since the site is briefly unavailable between steps b and c.

1. **Export everything from Paragraph first.** Run the *Export Paragraph archive* action from the Actions tab (or `npm run export-paragraph` locally) and commit `corpus/paragraph/`. Separately, export your **email subscriber list** from Paragraph's dashboard, because a blyg has no newsletter of its own (see "Email subscribers" below).
2. **Detach the domain from Paragraph.** Remove the custom domain in Paragraph's settings, and delete the DNS records Paragraph had you create for `pioneeringspirit.xyz` in the Cloudflare dashboard.
3. **Deploy.** Uncomment the `routes` block in `wrangler.jsonc` and push to `main` (or run `npm run deploy`). The deploy builds the archive and attaches `pioneeringspirit.xyz` as a Worker custom domain, which creates the DNS record and certificate automatically.
4. **Log in and push your settings.** `npm run blyg -- login`, then `npm run blyg -- settings`. You can also visit https://pioneeringspirit.xyz/studio.
5. **Redirect `www`.** In Cloudflare, add a redirect rule from `www.pioneeringspirit.xyz/*` to `https://pioneeringspirit.xyz/${1}` so the blyg has a single origin.
6. **Check the old links.** Any old post URL such as `https://pioneeringspirit.xyz/<slug>` should now show the archived copy, and `https://pioneeringspirit.xyz/paragraph/` lists them all.

Until the cutover, the `routes` block stays commented out and the blyg runs at https://pioneering-spirit-blyg.patrickatwater.workers.dev, which is a good place to rehearse: log in to `/studio`, push settings, and publish a test fragment.

### 5. Deploys

Cloudflare Workers Builds deploys this repo on every push to `main`. The project's build settings are:

| Setting | Value |
|---|---|
| Build command | `npm run build-archive` |
| Deploy command | `npx wrangler d1 migrations apply pioneering-spirit-blyg --remote && npx wrangler deploy` |
| Preview command | `npx wrangler versions upload` |
| Build variable | `NODE_VERSION` = `22` |

Posts themselves never need a deploy, because they live in the database.

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

**Blygger Desktop** is a fast native app by Aneesh Sathe that puts your reading list and your drafts in one window. This repo carries a Windows port of it; see "The desktop app" below.

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

## The desktop app

`desktop/` is Blygger Desktop, ported to Windows from Aneesh Sathe's macOS app. It reads the blygs and RSS feeds you subscribe to, lets you quote, stub, and follow what you read, and writes and publishes to your own blyg, all in one window and offline-first. Every Windows change is gated to Windows, so the macOS build is unchanged, and `desktop/WINDOWS.md` lists each one so the port can be offered back upstream.

**Getting it.** Each push that changes `desktop/` runs the *Desktop app* workflow, which builds and tests on Windows and macOS and leaves a `Blygger-<version>-windows-x64` zip on the run's summary page under **Artifacts**. Pushing a tag such as `desktop-v0.3.0-win1` also publishes that zip as a GitHub release. The build is unsigned, so SmartScreen asks once; `desktop/WINDOWS.md` explains it.

**Connecting it.** Set the `BLYG_OWNER_TOKEN` secret (step 3), then enter your blyg's address and that token in the app's **Connect your blyg** screen.

**Testing the pair.** Aneesh's end-to-end suite drives the real client against two local copies of this Worker, which is the best check that the app and `server-ext/` still agree:

```bash
cd desktop && BLYG_WORKER_DIR=.. bash scripts/e2e-local.sh
```

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
printf 'OWNER_PASSWORD=dev\nCOOKIE_SECRET=dev-secret\nBLYG_OWNER_TOKEN=dev-token\n' > .dev.vars
npm run migrate:local
npm run dev                                       # http://localhost:8787
BLYG_URL=http://localhost:8787 BLYG_PASSWORD=dev npm run blyg -- status
```

## Escape hatch

The whole public surface is static by design. The upstream `worker/scripts/export.ts` writes a byte-identical copy of the blyg to plain files, so the site can move to any static host if Cloudflare ever stops being the right home.
