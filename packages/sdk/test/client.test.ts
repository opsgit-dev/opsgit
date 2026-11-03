import { test } from "node:test";
import assert from "node:assert/strict";
import { FlagsClient, RemoteFlagsClient, type Bundle } from "../dist/index.js";

const bundleV1: Bundle = {
  version: 1,
  generated_at: "2026-10-31T00:00:00Z",
  etag: "v1",
  flags: {
    beta: { key: "beta", enabled: true, default: false, rules: [{ name: "staff", conditions: [{ attribute: "role", operator: "eq", value: "staff" }], value: true }] },
  },
};
const bundleV2: Bundle = { ...bundleV1, etag: "v2", flags: { ...bundleV1.flags, limit: { key: "limit", enabled: true, default: 10 } } };

function fakeServer(bundles: Bundle[]) {
  const calls: { url: string; ifNoneMatch: string | null; auth: string | null }[] = [];
  let current = 0;
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), ifNoneMatch: headers.get("if-none-match"), auth: headers.get("authorization") });
    const bundle = bundles[current];
    if (headers.get("if-none-match") === `"${bundle.etag}"`) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(bundle), { status: 200, headers: { etag: `"${bundle.etag}"` } });
  }) as typeof fetch;
  return { fetch, calls, advance: () => current++ };
}

test("FlagsClient loads the bundle, evaluates locally, and revalidates with If-None-Match", async () => {
  const server = fakeServer([bundleV1, bundleV2]);
  const updates: string[] = [];
  const client = await FlagsClient.init({
    baseUrl: "https://flags.example/",
    apiKey: "server-key",
    pollIntervalMs: 0,
    fetch: server.fetch,
    onUpdate: (b) => updates.push(b.etag),
  });

  assert.equal(client.etag, "v1");
  assert.equal(server.calls[0].url, "https://flags.example/v1/flags");
  assert.equal(server.calls[0].auth, "Bearer server-key");
  assert.equal(client.isEnabled("beta", { role: "staff" }), true);
  assert.equal(client.isEnabled("beta", { role: "user" }), false);
  assert.equal(client.get("limit", {}, 99), 99, "unknown flag returns the fallback");
  assert.equal(client.evaluation("missing"), undefined);

  assert.equal(await client.refresh(), false, "unchanged bundle is a 304");
  assert.equal(server.calls[1].ifNoneMatch, '"v1"');

  server.advance();
  assert.equal(await client.refresh(), true);
  assert.equal(client.etag, "v2");
  assert.equal(client.get("limit", {}, 99), 10);
  assert.deepEqual(updates, ["v1", "v2"]);
  client.close();
});

test("FlagsClient.init throws when the first fetch fails", async () => {
  const fetch = (async () => new Response("nope", { status: 401 })) as typeof globalThis.fetch;
  await assert.rejects(FlagsClient.init({ baseUrl: "https://x", apiKey: "k", fetch }), /401/);
});

test("FlagsClient.fromBundle works offline", () => {
  const client = FlagsClient.fromBundle(bundleV2);
  assert.equal(client.get("limit", {}, 0), 10);
});

test("RemoteFlagsClient posts context and returns the evaluation", async () => {
  let seen: { url: string; body: unknown } | null = null;
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(input), body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ key: "beta", value: true, reason: "RULE_MATCH", rule: "staff", etag: "v1", evaluated_at: "now" }));
  }) as typeof globalThis.fetch;
  const client = new RemoteFlagsClient({ baseUrl: "https://flags.example", apiKey: "client-key", fetch });
  const result = await client.evaluate("beta", { role: "staff" });
  assert.equal(result.value, true);
  assert.deepEqual(seen, { url: "https://flags.example/v1/evaluate", body: { flag_key: "beta", context: { role: "staff" } } });
});
