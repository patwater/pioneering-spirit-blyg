import assert from "node:assert/strict";
import { test } from "node:test";
import { translateLegacy } from "../src/compat.ts";

const call = (method: string, path: string, body?: unknown) =>
  translateLegacy(
    new Request(`https://blyg.test${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const shape = async (req: Request) => ({
  method: req.method,
  path: new URL(req.url).pathname,
  body: req.headers.get("content-type") ? await req.json() : undefined,
});

test("saving an item is a PATCH with the same fields", async () => {
  assert.deepEqual(await shape(await call("PUT", "/api/items/abc", { content_md: "hi" })), {
    method: "PATCH",
    path: "/api/items/abc",
    body: { content_md: "hi" },
  });
});

test("the responses toggle becomes the three-way field", async () => {
  assert.deepEqual((await shape(await call("PUT", "/api/items/abc/responses", { show: true }))).body, { responses: "show" });
  assert.deepEqual((await shape(await call("PUT", "/api/items/abc/responses", { show: false }))).body, { responses: "hide" });
});

test("pin moves the version into the path", async () => {
  assert.deepEqual(await shape(await call("POST", "/api/items/abc/pin", { version: 3 })), {
    method: "PUT",
    path: "/api/items/abc/versions/3/pin",
    body: undefined,
  });
});

test("fork and stub creation become POST /api/items with a mode", async () => {
  assert.deepEqual(await shape(await call("POST", "/api/fork", { origin: "https://o", id: "x", version: 2 })), {
    method: "POST",
    path: "/api/items",
    body: { mode: "fork", source: { origin: "https://o", id: "x", version: 2 } },
  });
  assert.deepEqual((await shape(await call("POST", "/api/stubs", { subscription_id: "s", remote_id: "r", selection: "q" }))).body, {
    mode: "response",
    source: { subscription_id: "s", remote_id: "r" },
    selection: "q",
  });
});

test("pause and resume become a paused flag", async () => {
  assert.deepEqual((await shape(await call("POST", "/api/subscriptions/s1/pause"))).body, { paused: true });
  assert.deepEqual(await shape(await call("POST", "/api/subscriptions/s1/resume")), {
    method: "PATCH",
    path: "/api/subscriptions/s1",
    body: { paused: false },
  });
});

test("subscription, hopper, mention and settings writes become PATCH", async () => {
  for (const [from, to] of [
    ["/api/subscriptions/s1", "/api/subscriptions/s1"],
    ["/api/hoppers/h1", "/api/hoppers/h1"],
    ["/api/mentions/m1/hidden", "/api/mentions/m1"],
    ["/api/settings", "/api/settings"],
  ]) {
    const out = await shape(await call("PUT", from, { hidden: true }));
    assert.equal(out.method, "PATCH");
    assert.equal(out.path, to);
  }
});

test("routes the studio still has pass through untouched", async () => {
  for (const [method, path] of [
    ["POST", "/api/items"],
    ["PATCH", "/api/items/abc"],
    ["GET", "/api/items/abc"],
    ["DELETE", "/api/items/abc"],
    ["POST", "/api/items/abc/publish"],
    ["PUT", "/api/signals/s/r"],
  ]) {
    const req = new Request(`https://blyg.test${path}`, { method });
    assert.equal(await translateLegacy(req), req);
  }
});

test("a body the old route would reject is left for the studio to answer", async () => {
  const bad = new Request("https://blyg.test/api/items/abc/responses", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ show: "yes" }),
  });
  assert.equal(await translateLegacy(bad), bad);
});
