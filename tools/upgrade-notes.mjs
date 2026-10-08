#!/usr/bin/env node
// Print the part of a Blygger Studio upgrade a reviewer needs before merging:
// the new migrations, config the release notes ask for, and each release's
// "Migrations" line. Used by the upgrade workflow for the pull request body.
//
//   node tools/upgrade-notes.mjs <old-version> <new-version>
//
// Run it after `npm run upgrade-worker`, from the repository root, so that
// worker/ holds the new release and `git` can see what is new in it.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("usage: upgrade-notes.mjs <old-version> <new-version>");
  process.exit(1);
}

const added = execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "worker/migrations"], { encoding: "utf8" })
  .split("\n")
  .filter((l) => l.startsWith("??") || l.startsWith("A "))
  .map((l) => l.slice(3).replace(/^worker\/migrations\//, ""))
  .filter(Boolean);

const cmp = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

const changelog = readFileSync("worker/CHANGELOG.md", "utf8");
const releases = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) — (\S+)\n([\s\S]*?)(?=^## \d|\n---\n|$(?![\s\S]))/gm)]
  .map(([, version, date, body]) => ({ version, date, body }))
  .filter((r) => cmp(r.version, from) > 0 && cmp(r.version, to) <= 0);

const out = [];
out.push(`## Blygger Studio ${from} to ${to}`, "");
out.push(
  added.length
    ? `This upgrade adds ${added.length} migration${added.length === 1 ? "" : "s"}: ${added.map((f) => `\`${f}\``).join(", ")}. Merging applies them to the live database before the new code deploys, so confirm each one is additive.`
    : "This upgrade adds no migrations.",
  "",
);

const flagged = releases.filter((r) => /\*\*Config|add a block|\bnodejs_compat\b|Enable `|must (replace|add|change)|upgrade promptly/i.test(r.body));
out.push("### Releases that ask the operator to do something", "");
if (flagged.length) {
  for (const r of flagged) {
    const lines = r.body.split("\n").filter((l) => /Config|add a block|nodejs_compat|Enable `|must (replace|add|change)|Upgrade promptly|invalidated/i.test(l));
    out.push(`- **${r.version}** (${r.date}): ${lines.map((l) => l.replace(/\*\*/g, "").replace(/^[-*\s]+/, "").trim()).join(" ")}`.slice(0, 600));
  }
} else {
  out.push("None of the release notes asks for a configuration change. Still read them below.");
}
out.push("", "### Migrations per release", "");
for (const r of releases) {
  const line = r.body.split("\n").find((l) => /Migrations/i.test(l)) ?? "Migrations: not stated.";
  out.push(`- **${r.version}** (${r.date}): ${line.replace(/\*\*/g, "").replace(/^[-*\s]+/, "").trim()}`.slice(0, 400));
}
console.log(out.join("\n"));
