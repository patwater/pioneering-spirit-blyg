# pioneering-spirit-blyg

Syncs [Pioneering Spirit](https://pioneeringspirit.xyz) (Paragraph.com) to a [Blygger 0.2](https://blygger.org/spec/0.2/) blyg, served at **[blyg.pioneeringspirit.xyz](https://blyg.pioneeringspirit.xyz/)**.

## What this is

A blyg is a tiny directory of static files — JSON items, an RSS feed, a manifest — that any blyg reader can subscribe to. It is decentralised by design: it lives on your own domain, runs on any static host, and works with any RSS reader. This repo pulls posts from the Paragraph API nightly and writes the full blyg surface to `output/`, then deploys it to Cloudflare Pages.

## File layout

```
.
├── generate.py              # the sync script
├── id-map.json              # paragraph post-id → blyg id mapping (committed)
├── requirements.txt
├── _headers                 # CORS + content-type rules for Cloudflare Pages
└── .github/workflows/
    └── sync.yml             # nightly GitHub Actions job
```

The generated `output/` directory (git-ignored) contains the live blyg surface:

```
output/
├── blyg.json                # manifest
├── feed.xml                 # RSS 2.0 notification feed (50-entry window)
└── items/
    ├── index.json           # lossless archive index — every post ever
    └── <blyg-id>.json       # one file per post
```

## First-time setup

### 1. Create the GitHub repo

Push this folder as a new GitHub repository (public or private — the deployed site is always public).

### 2. Add GitHub secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `PARAGRAPH_API_KEY` | From [app.paragraph.com](https://app.paragraph.com) → Settings → API keys |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with *Cloudflare Pages: Edit* permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (visible in the dashboard sidebar) |

### 3. Create the Cloudflare Pages project

In the Cloudflare dashboard, create a new Pages project named **`pioneering-spirit-blyg`**. Leave the build command blank — the GitHub Action deploys directly via Wrangler.

### 4. Add the subdomain

In your DNS provider (wherever `pioneeringspirit.xyz` is managed), add a CNAME:

```
blyg.pioneeringspirit.xyz  →  pioneering-spirit-blyg.pages.dev
```

Then in the Cloudflare Pages project, add `blyg.pioneeringspirit.xyz` as a custom domain.

### 5. Wire up discovery from the main site

Paragraph lets you add custom HTML to the `<head>`. Add this one line so blyg readers can discover the blyg from `pioneeringspirit.xyz`:

```html
<link rel="blyg" href="https://blyg.pioneeringspirit.xyz/">
```

In Paragraph: **Settings → Website → Custom code → Head**.

### 6. Run the first sync

Trigger the workflow manually from the **Actions** tab, or run locally:

```bash
pip install -r requirements.txt
PARAGRAPH_API_KEY=your-key python generate.py
```

The first run seeds the entire post archive. `id-map.json` will be updated and committed automatically on subsequent nightly runs.

## How it works

**Stable IDs.** Every Paragraph post gets a permanent 26-character [Crockford base32](https://www.crockford.com/base32.html) blyg ID, generated once and stored in `id-map.json`. Re-runs never reassign IDs, which is required by the Blygger spec.

**Version tracking.** Each run hashes the assembled Markdown for each post. If the hash changed since the last run, the script bumps the version counter and appends an entry to the post's changelog — so blyg readers can see that a post was edited.

**Two planes.** The blyg spec distinguishes a *notification plane* (the RSS feed, lossy, 50 entries) from a *state plane* (the archive index and item files, lossless, everything). Readers use the feed for cheap polling and the index to recover any gaps.

## Running locally

```bash
pip install -r requirements.txt

# Required
export PARAGRAPH_API_KEY=your-key

# Optional overrides (defaults shown)
export PARAGRAPH_DOMAIN=pioneeringspirit.xyz
export BLYG_ORIGIN=https://blyg.pioneeringspirit.xyz/
export OUTPUT_DIR=output

python generate.py
```

Check the output:

```bash
python -m json.tool output/blyg.json
python -m json.tool output/items/index.json | head -40
```

## Subscribe

Point any RSS reader or blyg client at:

```
https://blyg.pioneeringspirit.xyz/feed.xml
```

Or give it just `https://pioneeringspirit.xyz` — the `rel="blyg"` link tag (once added) lets blyg readers resolve it automatically.
