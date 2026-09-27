#!/usr/bin/env node
// Replace worker/ with a fresh copy of the upstream Blygger reference client.
//
//   npm run upgrade-worker              # latest upstream main
//   npm run upgrade-worker -- <ref>     # a specific commit, tag, or branch
//
// worker/ is never edited in this repo, so an upgrade is a clean overwrite.
// Afterwards: review `git diff --stat worker`, run `npm install` and
// `npm test`, apply any new migrations (`npm run migrate`), then deploy.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pinFile = path.join(root, "upstream.json");
const pin = JSON.parse(readFileSync(pinFile, "utf8"));
const ref = process.argv[2] ?? "main";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const tmp = mkdtempSync(path.join(tmpdir(), "blygger-upstream-"));
try {
  console.log(`Fetching ${pin.repo} at ${ref} ...`);
  git(["init", "-q"], tmp);
  git(["fetch", "-q", "--depth", "1", pin.repo, ref], tmp);
  git(["checkout", "-q", "FETCH_HEAD"], tmp);
  const commit = git(["rev-parse", "HEAD"], tmp);
  const date = git(["log", "-1", "--format=%cs"], tmp);

  if (commit === pin.commit) {
    console.log(`Already at ${commit}. Nothing to do.`);
    process.exit(0);
  }

  const dest = path.join(root, pin.path);
  const keep = new Set(["node_modules", ".wrangler"]);
  for (const entry of readdirSync(dest)) {
    if (!keep.has(entry)) rmSync(path.join(dest, entry), { recursive: true, force: true });
  }
  cpSync(path.join(tmp, pin.path), dest, {
    recursive: true,
    filter: (src) => !src.split(path.sep).some((part) => keep.has(part)),
  });

  writeFileSync(pinFile, JSON.stringify({ ...pin, commit, date }, null, 2) + "\n");
  console.log(`worker/ now matches upstream ${commit.slice(0, 12)} (${date}); was ${pin.commit.slice(0, 12)}.`);
  console.log("\nNext steps:");
  console.log("  git diff --stat worker          # watch worker/migrations and wrangler changes closely");
  console.log("  npm install && npm test");
  console.log("  npm run migrate                 # only if worker/migrations gained files");
  console.log("  npm run deploy");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
