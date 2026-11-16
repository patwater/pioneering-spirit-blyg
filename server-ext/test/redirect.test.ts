// The retired workers.dev address sends its public pages to the custom
// domain, and nothing else moves (server-ext/src/redirect.ts).

import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalRedirect } from "../src/redirect.ts";

const env = {
  REDIRECT_FROM_HOST: "pioneering-spirit-blyg.patrickatwater.workers.dev",
  CANONICAL_ORIGIN: "https://blyg.pioneeringspirit.xyz",
};
const old = (p: string) => new URL(`https://pioneering-spirit-blyg.patrickatwater.workers.dev${p}`);

test("public reads at the retired address go to the canonical origin, path and query kept", () => {
  assert.equal(canonicalRedirect("GET", old("/t/abc/"), env), "https://blyg.pioneeringspirit.xyz/t/abc/");
  assert.equal(canonicalRedirect("GET", old("/blyg.json"), env), "https://blyg.pioneeringspirit.xyz/blyg.json");
  assert.equal(canonicalRedirect("HEAD", old("/feed.xml?x=1"), env), "https://blyg.pioneeringspirit.xyz/feed.xml?x=1");
  assert.equal(canonicalRedirect("GET", old("/"), env), "https://blyg.pioneeringspirit.xyz/");
});

test("the API, the studio and every write stay where they are", () => {
  for (const p of ["/api", "/api/items", "/studio", "/studio/login", "/studio/auth/oauth2/token"]) {
    assert.equal(canonicalRedirect("GET", old(p), env), null, p);
  }
  assert.equal(canonicalRedirect("POST", old("/webmention"), env), null);
  assert.equal(canonicalRedirect("PATCH", old("/t/abc/"), env), null);
});

test("other hosts, branch previews and an unconfigured deployment are untouched", () => {
  assert.equal(canonicalRedirect("GET", new URL("https://blyg.pioneeringspirit.xyz/t/abc/"), env), null);
  assert.equal(canonicalRedirect("GET", new URL("https://claude-x-pioneering-spirit-blyg.patrickatwater.workers.dev/t/abc/"), env), null);
  assert.equal(canonicalRedirect("GET", new URL("http://localhost:8787/t/abc/"), env), null);
  assert.equal(canonicalRedirect("GET", old("/t/abc/"), {}), null);
  assert.equal(canonicalRedirect("GET", old("/t/abc/"), { REDIRECT_FROM_HOST: env.REDIRECT_FROM_HOST }), null);
});
