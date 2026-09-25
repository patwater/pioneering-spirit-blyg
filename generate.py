#!/usr/bin/env python3
"""
paragraph-to-blyg: Sync a Paragraph.com publication to a Blygger 0.2 blyg.

Usage:
    PARAGRAPH_API_KEY=your-key python generate.py

Environment variables:
    PARAGRAPH_API_KEY   Required. Generate at app.paragraph.com -> Settings -> API keys.
    PARAGRAPH_DOMAIN    Domain of your Paragraph site. Default: pioneeringspirit.xyz
    BLYG_ORIGIN         Base URL where the blyg is served. Default: https://blyg.pioneeringspirit.xyz/
    OUTPUT_DIR          Where to write the blyg files. Default: output
"""

import hashlib
import json
import os
import secrets
import sys
from datetime import datetime, timezone
from email.utils import format_datetime as fmt_rfc822
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PARAGRAPH_DOMAIN = os.environ.get("PARAGRAPH_DOMAIN", "pioneeringspirit.xyz")
BLYG_ORIGIN      = os.environ.get("BLYG_ORIGIN", "https://blyg.pioneeringspirit.xyz/")
OUTPUT_DIR       = Path(os.environ.get("OUTPUT_DIR", "output"))
API_KEY          = os.environ.get("PARAGRAPH_API_KEY", "")
ID_MAP_FILE      = Path("id-map.json")

BLYG_VERSION = "0.2"
BLYG_NS      = "https://blygger.org/ns/0.1"
FEED_WINDOW  = 50  # max entries in feed.xml

AUTHOR_NAME = "Patrick Atwater"
AUTHOR_BIO  = (
    "Innovation Program Manager at Metropolitan Water District of Southern California. "
    "Writer, cyclist, board game enthusiast."
)

# ---------------------------------------------------------------------------
# Crockford base32 ID generation
# The blyg spec requires 128 random bits as 26 lowercase Crockford base32 chars.
# ---------------------------------------------------------------------------

_CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"

def new_blyg_id() -> str:
    n = secrets.randbits(128)
    chars = []
    for _ in range(26):
        chars.append(_CROCKFORD[n & 0x1F])
        n >>= 5
    return "".join(reversed(chars))

# ---------------------------------------------------------------------------
# Timestamp helpers
# ---------------------------------------------------------------------------

def epoch_ms_to_iso(epoch_ms) -> str:
    if not epoch_ms:
        return utc_now()
    ts = int(epoch_ms) / 1000
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def iso_to_rfc822(iso: str) -> str:
    dt = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return fmt_rfc822(dt)

def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------

def sha256_of(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()

# ---------------------------------------------------------------------------
# Paragraph API
# ---------------------------------------------------------------------------

def api_get(path: str, params: dict = None) -> dict:
    r = requests.get(
        f"https://public.api.paragraph.com/api{path}",
        headers={"Authorization": f"Bearer {API_KEY}"},
        params=params or {},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

def get_publication() -> dict:
    return api_get(f"/v1/publications/domain/{PARAGRAPH_DOMAIN}")

def fetch_all_posts(pub_id: str) -> list:
    """Paginate through all published posts, requesting full content."""
    posts, cursor = [], None
    while True:
        params = {"includeContent": "true", "limit": 100}
        if cursor:
            params["cursor"] = cursor
        data = api_get(f"/v1/publications/{pub_id}/posts", params)
        posts.extend(data.get("items", []))
        pg = data.get("pagination", {})
        if not pg.get("hasMore") or not pg.get("cursor"):
            break
        cursor = pg["cursor"]
        print(f"  ... fetched {len(posts)} posts so far")
    return posts

# ---------------------------------------------------------------------------
# ID map -- persisted between runs to keep blyg IDs stable.
#
# Format: { "<paragraph_post_id>": { "id": "<blyg_id>", "version": N,
#           "content_hash": "sha256:...", "created": "ISO",
#           "changelog": [{"version": N, "at": "ISO", "note": null}] } }
#
# On each run we compare content_hash; a change bumps version and appends
# a changelog entry, which is what lets blyg readers detect edits.
# ---------------------------------------------------------------------------

def load_id_map() -> dict:
    if ID_MAP_FILE.exists():
        return json.loads(ID_MAP_FILE.read_text())
    return {}

def save_id_map(m: dict):
    ID_MAP_FILE.write_text(json.dumps(m, indent=2, sort_keys=True) + "\n")

def get_or_create_entry(id_map: dict, para_id: str, created_iso: str) -> dict:
    if para_id not in id_map:
        id_map[para_id] = {
            "id": new_blyg_id(),
            "version": 0,           # will be bumped on first content write
            "content_hash": "",
            "created": created_iso,
            "changelog": [],
        }
    return id_map[para_id]

# ---------------------------------------------------------------------------
# Content assembly
# Paragraph posts have a separate title field; we prepend it as an H1 so
# blyg readers see self-contained content.
# ---------------------------------------------------------------------------

def assemble_md(post: dict) -> str:
    title    = (post.get("title") or "").strip()
    subtitle = (post.get("subtitle") or "").strip()
    body     = (post.get("markdown") or "").strip()
    parts = []
    if title:
        parts.append(f"# {title}")
    if subtitle:
        parts.append(f"*{subtitle}*")
    if body:
        parts.append(body)
    source_url = f"https://{PARAGRAPH_DOMAIN}/{post.get('slug', '')}"
    parts.append(f"\n---\n*Originally published on [Pioneering Spirit]({source_url}).*")
    return "\n\n".join(parts)

def assemble_html(post: dict) -> str:
    title    = (post.get("title") or "").strip()
    subtitle = (post.get("subtitle") or "").strip()
    body     = (post.get("staticHtml") or "").strip()
    source_url = f"https://{PARAGRAPH_DOMAIN}/{post.get('slug', '')}"

    parts = []
    if title:
        parts.append(f"<h1>{_esc(title)}</h1>")
    if subtitle:
        parts.append(f"<p><em>{_esc(subtitle)}</em></p>")
    if body:
        parts.append(body)
    parts.append(
        f'<hr><p><em>Originally published on '
        f'<a href="{source_url}">Pioneering Spirit</a>.</em></p>'
    )
    return "\n".join(parts)

def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

# ---------------------------------------------------------------------------
# Blyg item builder
# ---------------------------------------------------------------------------

def build_item(post: dict, entry: dict) -> dict:
    blyg_id  = entry["id"]
    version  = entry["version"]
    created  = entry["created"]
    updated  = epoch_ms_to_iso(post.get("updatedAt") or post.get("publishedAt"))

    md   = assemble_md(post)
    html = assemble_html(post)

    return {
        "blyg": BLYG_VERSION,
        "id": blyg_id,
        "kind": "fragment",
        "origin": BLYG_ORIGIN,
        "author": {"name": AUTHOR_NAME, "url": BLYG_ORIGIN},
        "created": created,
        "updated": updated,
        "version": version,
        "content_md": md,
        "content_html": html,
        "content_hash": sha256_of(md),
        "media": [],
        "changelog": entry["changelog"],
    }

# ---------------------------------------------------------------------------
# Blyg surface builders
# ---------------------------------------------------------------------------

def build_manifest(items: list, pub: dict) -> dict:
    updated = max((i["updated"] for i in items), default=utc_now())
    return {
        "blyg": BLYG_VERSION,
        "level": 1,
        "generator": "paragraph-to-blyg/0.1.0",
        "site": BLYG_ORIGIN,
        "title": pub.get("name", "Pioneering Spirit"),
        "author": {
            "name": AUTHOR_NAME,
            "bio": AUTHOR_BIO,
            "avatar": pub.get("logoUrl", ""),
            "links": [
                {"label": "Pioneering Spirit", "url": f"https://{PARAGRAPH_DOMAIN}"},
            ],
        },
        "feed": "feed.xml",
        "items": "items/index.json",
        "updated": updated,
    }

def build_index(items: list) -> dict:
    updated = max((i["updated"] for i in items), default=utc_now())
    rows = sorted(
        [
            {
                "id": i["id"],
                "kind": i["kind"],
                "created": i["created"],
                "updated": i["updated"],
                "version": i["version"],
            }
            for i in items
        ],
        key=lambda x: x["updated"],
        reverse=True,
    )
    return {"updated": updated, "items": rows}

def build_feed(items: list, pub: dict) -> str:
    window = sorted(items, key=lambda x: x["updated"], reverse=True)[:FEED_WINDOW]
    last_build = window[0]["updated"] if window else utc_now()
    pub_title  = _esc(pub.get("name", "Pioneering Spirit"))
    pub_desc   = _esc(pub.get("summary", "Writing on water, California, and civic innovation."))

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<rss version="2.0" xmlns:blyg="{BLYG_NS}">',
        "  <channel>",
        f"    <title>{pub_title}</title>",
        f"    <link>{_esc(BLYG_ORIGIN)}</link>",
        f"    <description>{pub_desc}</description>",
        f"    <lastBuildDate>{iso_to_rfc822(last_build)}</lastBuildDate>",
        f"    <blyg:level>1</blyg:level>",
        f"    <blyg:manifest>{_esc(BLYG_ORIGIN + 'blyg.json')}</blyg:manifest>",
    ]

    for item in window:
        blyg_id = item["id"]
        version = item["version"]
        title   = _feed_title(item)
        link    = f"{BLYG_ORIGIN}f/{blyg_id}/"
        html    = item["content_html"]

        lines += [
            "    <item>",
            f'      <guid isPermaLink="false">blyg:{blyg_id}:v{version}</guid>',
            f"      <link>{_esc(link)}</link>",
            f"      <title>{_esc(title)}</title>",
            f"      <description><![CDATA[{html}]]></description>",
            f"      <pubDate>{iso_to_rfc822(item['updated'])}</pubDate>",
            f"      <blyg:id>{blyg_id}</blyg:id>",
            f"      <blyg:kind>{item['kind']}</blyg:kind>",
            f"      <blyg:version>{version}</blyg:version>",
            f"      <blyg:created>{item['created']}</blyg:created>",
            f"      <blyg:item>{_esc(BLYG_ORIGIN + 'items/' + blyg_id + '.json')}</blyg:item>",
            "    </item>",
        ]

    lines += ["  </channel>", "</rss>"]
    return "\n".join(lines) + "\n"

def _feed_title(item: dict) -> str:
    for line in item.get("content_md", "").splitlines():
        stripped = line.strip().lstrip("#").strip()
        if stripped:
            return stripped[:120]
    return item["id"]

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if not API_KEY:
        sys.exit("Error: set the PARAGRAPH_API_KEY environment variable.")

    print(f"Fetching publication: {PARAGRAPH_DOMAIN}")
    pub    = get_publication()
    pub_id = pub["id"]
    print(f"  -> {pub['name']} (id: {pub_id})")

    print("Fetching posts (this may take a moment for large archives)...")
    raw_posts = fetch_all_posts(pub_id)
    print(f"  -> {len(raw_posts)} posts returned")

    id_map = load_id_map()
    items  = []
    now    = utc_now()

    for post in raw_posts:
        md = post.get("markdown") or ""
        if not md and not post.get("staticHtml"):
            # Skip posts without any content (paywalled previews, etc.)
            continue

        created = epoch_ms_to_iso(post.get("publishedAt"))
        entry   = get_or_create_entry(id_map, post["id"], created)
        new_md  = assemble_md(post)
        new_hash = sha256_of(new_md)

        if new_hash != entry["content_hash"]:
            # Content changed (or first run): bump version and record it
            entry["version"]      += 1
            entry["content_hash"]  = new_hash
            entry["changelog"].append({
                "version": entry["version"],
                "at": now,
                "note": None,
            })

        items.append(build_item(post, entry))

    save_id_map(id_map)
    print(f"  -> {len(items)} items built ({sum(1 for e in id_map.values() if e['version'] > 1)} updated this run)")

    # Write output tree
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    items_dir = OUTPUT_DIR / "items"
    items_dir.mkdir(exist_ok=True)

    for item in items:
        path = items_dir / f"{item['id']}.json"
        path.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n")

    manifest = build_manifest(items, pub)
    (OUTPUT_DIR / "blyg.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    )

    index = build_index(items)
    (items_dir / "index.json").write_text(
        json.dumps(index, indent=2, ensure_ascii=False) + "\n"
    )

    feed = build_feed(items, pub)
    (OUTPUT_DIR / "feed.xml").write_text(feed)

    total = len(items)
    print(f"\nDone. Output written to {OUTPUT_DIR}/")
    print(f"  blyg.json         (manifest)")
    print(f"  feed.xml          ({min(total, FEED_WINDOW)}-entry RSS window)")
    print(f"  items/index.json  ({total} items)")
    print(f"  items/*.json      ({total} item files)")
    print(f"\nBlyg origin: {BLYG_ORIGIN}")
    print(f"Subscribe at: {BLYG_ORIGIN}feed.xml")

if __name__ == "__main__":
    main()
