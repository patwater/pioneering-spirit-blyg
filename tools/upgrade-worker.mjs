#!/usr/bin/env node
// Replace worker/ with a fresh copy of a Blygger Studio release.
//
//   npm run upgrade-worker              # the newest vX.Y.Z release tag
//   npm run upgrade-worker -- <ref>     # a specific tag, branch, or commit
//
// worker/ is never edited in this repo, so an upgrade is a clean overwrite.
// Studio's own `npm run upgrade` merges into a fork; this repo does not fork
// it, so that script is not used here.
//
// The copy is verbatim except for `.git` and `.github`. The release is
// fetched and checked before anything in worker/ is touched, so a moved or
// restructured upstream stops the script with worker/ intact.
//
// Afterwards: review `git diff --stat worker`, run `npm install` (which
// rebuilds the studio app) and `npm test`, apply any new migrations
// (`npm run migrate`) BEFORE deploying, then deploy.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pinFile = path.join(root, "upstream.json");
const pin = JSON.parse(readFileSync(pinFile, "utf8"));
const requested = process.argv[2] ?? "latest";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const die = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

// Newest vX.Y.Z tag, by version order. Prereleases and peeled refs are skipped.
function latestTag() {
  const lines = git(["ls-remote", "--tags", "--sort=-v:refname", pin.repo]).split("\n");
  for (const line of lines) {
    const ref = line.split("\t")[1] ?? "";
    if (/^refs\/tags\/v\d+\.\d+\.\d+$/.test(ref)) return ref.slice("refs/tags/".length);
  }
  return die(`no vX.Y.Z release tags found at ${pin.repo}`);
}

const ref = requested === "latest" ? latestTag() : requested;
const tmp = mkdtempSync(path.join(tmpdir(), "blygger-studio-"));
try {
  console.log(`Fetching ${pin.repo} at ${ref} ...`);
  git(["init", "-q"], tmp);
  git(["fetch", "-q", "--depth", "1", pin.repo, ref], tmp);
  git(["checkout", "-q", "FETCH_HEAD"], tmp);
  const commit = git(["rev-parse", "HEAD"], tmp);
  const date = git(["log", "-1", "--format=%cs"], tmp);

  const src = path.join(tmp, pin.path);
  const manifest = path.join(src, "package.json");
  if (!existsSync(manifest) || JSON.parse(readFileSync(manifest, "utf8")).name !== pin.package) {
    die(`${ref} has no ${pin.package} package at "${pin.path}". worker/ was not touched.`);
  }
  const version = JSON.parse(readFileSync(manifest, "utf8")).version;

  if (commit === pin.commit) {
    console.log(`Already at ${commit}. Nothing to do.`);
    process.exit(0);
  }

  const dest = path.join(root, "worker");
  const keepInPlace = new Set(["node_modules", ".wrangler"]);
  const skipCopy = new Set([".git", ".github", "node_modules", ".wrangler", "build"]);
  for (const entry of readdirSync(dest)) {
    if (!keepInPlace.has(entry)) rmSync(path.join(dest, entry), { recursive: true, force: true });
  }
  cpSync(src, dest, {
    recursive: true,
    filter: (p) => !path.relative(src, p).split(path.sep).some((part) => skipCopy.has(part)),
  });

  const next = { ...pin, tag: ref.startsWith("v") ? ref : pin.tag, version, commit, date };
  writeFileSync(pinFile, JSON.stringify(next, null, 2) + "\n");
  console.log(`worker/ now matches Blygger Studio ${version} at ${commit.slice(0, 12)} (${date}); was ${pin.version} at ${pin.commit.slice(0, 12)}.`);
  console.log("\nNext steps:");
  console.log("  git diff --stat worker          # watch worker/migrations and worker/wrangler.jsonc closely");
  console.log("  npm install && npm test         # install rebuilds the studio app");
  console.log("  npm run migrate                 # only if worker/migrations gained files; do this BEFORE deploying");
  console.log("  npm run deploy");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
