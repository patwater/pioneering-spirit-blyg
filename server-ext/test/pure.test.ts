// Unit tests for the extensions' pure parts. The end-to-end behaviour is
// tested by Blygger Desktop's own suite against a local Worker (README).

import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeCursor, encodeCursor, readingLimit } from "../src/cursor.ts";
import { checkScopes } from "../src/provenance-check.ts";
import { markProblem } from "../src/readstate.ts";

test("cursors round-trip and refuse anything else", () => {
  const c: [string, string, string] = ["2026-09-27T05:00:00Z", "sub1", "rémote/ïd"];
  assert.deepEqual(decodeCursor(encodeCursor(c)), c);
  assert.equal(decodeCursor("%%%"), null);
  assert.equal(decodeCursor("bm90IGpzb24"), null);
  assert.equal(decodeCursor(encodeCursor(["a", "b", "c"]).slice(0, -2) + "!!"), null);
});

test("reading limit defaults to 100 and clamps to 1..500", () => {
  assert.equal(readingLimit(null), 100);
  assert.equal(readingLimit("2"), 2);
  assert.equal(readingLimit("0"), 1);
  assert.equal(readingLimit("9999"), 500);
  assert.equal(readingLimit("abc"), 100);
});

test("provenance entries are checked before anything is written", () => {
  const ok = checkScopes([null, { index: 1, model: "m", sources: [{ id: "x" }, { id: "y", version: 2 }] }]);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.entries[0], null);
    assert.deepEqual(ok.entries[1], { model: "m", sources: [{ id: "x" }, { id: "y", version: 2 }] });
  }
  assert.equal(checkScopes("nope").ok, false);
  assert.equal(checkScopes([{ model: "" }]).ok, false);
  assert.equal(checkScopes([{ index: 3, model: "m" }]).ok, false);
  assert.equal(checkScopes([{ model: "m", at: "not a time" }]).ok, false);
  assert.equal(checkScopes([{ model: "m", sources: [{ id: "x", version: 0 }] }]).ok, false);
  // The instruction never comes in, so it can never be stored.
  const stored = checkScopes([{ model: "m", instruction: "secret" }]);
  assert.ok(stored.ok && !("instruction" in (stored.entries[0] ?? {})));
});

test("read marks need a sub, a remote id and a non-negative version", () => {
  assert.equal(markProblem({ sub: "s", remote_id: "r", version: 0 }), null);
  assert.notEqual(markProblem({ sub: "", remote_id: "r", version: 1 }), null);
  assert.notEqual(markProblem({ sub: "s", remote_id: "r", version: -1 }), null);
  assert.notEqual(markProblem({ sub: "s", remote_id: "r", version: 1.5 }), null);
  assert.notEqual(markProblem(null), null);
});
