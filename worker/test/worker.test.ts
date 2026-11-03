import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { type Env } from "../src/index.ts";

const env: Env = { SERVER_KEYS: "server-a, server-b", CLIENT_KEYS: "client-a", ALLOWED_ORIGINS: "*" };
const BASE = "https://flags.test";

function call(path: string, init: RequestInit & { key?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (init.key) headers.set("authorization", `Bearer ${init.key}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return worker.fetch(new Request(`${BASE}${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }), init.env ?? env);
}
interface ExtraInit { env?: Env }
declare module "node:test" {}
type _ = ExtraInit;

test("health is public and reports the bundle", async () => {
  const res = await call("/health");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.flags >= 1);
  assert.match(body.etag, /^[0-9a-f]{16}$/);
});

test("503 when no keys are configured", async () => {
  const res = await worker.fetch(new Request(`${BASE}/v1/flags`), {});
  assert.equal(res.status, 503);
});

test("401 without a key, with a wrong key, and with a key in the wrong role", async () => {
  assert.equal((await call("/v1/flags")).status, 401);
  assert.equal((await call("/v1/flags", { key: "nope" })).status, 401);
  assert.equal((await call("/v1/flags", { key: "client-a" })).status, 403);
  assert.equal((await call("/v1/flags/new_checkout_v2", { key: "client-a" })).status, 403);
});

test("x-api-key header and any listed server key work", async () => {
  const res = await worker.fetch(new Request(`${BASE}/v1/flags`, { headers: { "x-api-key": "server-b" } }), env);
  assert.equal(res.status, 200);
});

test("bundle has an ETag and honours If-None-Match", async () => {
  const first = await call("/v1/flags", { key: "server-a" });
  assert.equal(first.status, 200);
  const etag = first.headers.get("etag")!;
  assert.match(etag, /^"[0-9a-f]{16}"$/);
  const bundle = await first.json();
  assert.equal(bundle.version, 1);
  assert.ok(bundle.segments, "segments ship with the bundle");

  const again = await call("/v1/flags", { key: "server-a", headers: { "if-none-match": etag } });
  assert.equal(again.status, 304);
  const weak = await call("/v1/flags", { key: "server-a", headers: { "if-none-match": `W/${etag}` } });
  assert.equal(weak.status, 304);
});

test("evaluate resolves rules, segments, and rollouts", async () => {
  const staging = await (await call("/v1/evaluate", { method: "POST", key: "client-a", json: { flag_key: "new_checkout_v2", context: { environment: "staging" } } })).json();
  assert.equal(staging.value, true);
  assert.equal(staging.rule, "staging-everyone");

  const beta = await (await call("/v1/evaluate", { method: "POST", key: "client-a", json: { flag_key: "new_checkout_v2", context: { environment: "production", beta_opt_in: true, plan: "pro" } } })).json();
  assert.equal(beta.rule, "beta-testers");

  const anon = await (await call("/v1/evaluate", { method: "POST", key: "client-a", json: { flag_key: "new_checkout_v2", context: { environment: "production", country: "US" } } })).json();
  assert.equal(anon.reason, "DEFAULT", "no user_id means no rollout");
});

test("evaluate rejects bad input", async () => {
  assert.equal((await call("/v1/evaluate", { method: "POST", key: "client-a", body: "{oops" })).status, 400);
  assert.equal((await call("/v1/evaluate", { method: "POST", key: "client-a", json: { context: {} } })).status, 400);
  assert.equal((await call("/v1/evaluate", { method: "POST", key: "client-a", json: { flag_key: "missing" } })).status, 404);
  const big = await call("/v1/evaluate", { method: "POST", key: "client-a", body: JSON.stringify({ flag_key: "new_checkout_v2", context: { pad: "x".repeat(70_000) } }) });
  assert.equal(big.status, 413 === big.status ? 413 : 400);
});

test("evaluate-all returns every flag and drops non-scalar context", async () => {
  const res = await call("/v1/evaluate-all", { method: "POST", key: "client-a", json: { context: { environment: "staging", nested: { a: 1 }, list: [1] } } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Object.keys(body.flags).length >= 3);
  assert.equal(body.flags.new_checkout_v2.value, true);
});

test("CORS preflight and allowed-origin lists", async () => {
  const any = await call("/v1/evaluate", { method: "OPTIONS", headers: { origin: "https://a.example" } });
  assert.equal(any.status, 204);
  assert.equal(any.headers.get("access-control-allow-origin"), "*");

  const strict: Env = { ...env, ALLOWED_ORIGINS: "https://ok.example, https://also.example" };
  const ok = await worker.fetch(new Request(`${BASE}/health`, { headers: { origin: "https://ok.example" } }), strict);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://ok.example");
  const no = await worker.fetch(new Request(`${BASE}/health`, { headers: { origin: "https://evil.example" } }), strict);
  assert.equal(no.headers.get("access-control-allow-origin"), null);
});

test("rate limiter applies to client keys only", async () => {
  const limited: Env = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const client = await worker.fetch(new Request(`${BASE}/v1/evaluate`, { method: "POST", headers: { authorization: "Bearer client-a" }, body: "{}" }), limited);
  assert.equal(client.status, 429);
  const server = await worker.fetch(new Request(`${BASE}/v1/flags`, { headers: { authorization: "Bearer server-a" } }), limited);
  assert.equal(server.status, 200);
});

test("analytics points are written per evaluation", async () => {
  const points: unknown[] = [];
  const tracked: Env = { ...env, EVALUATIONS: { writeDataPoint: (p) => points.push(p) } };
  await worker.fetch(new Request(`${BASE}/v1/evaluate-all`, { method: "POST", headers: { authorization: "Bearer server-a" }, body: "{}" }), tracked);
  assert.ok(points.length >= 3);
  assert.deepEqual((points[0] as { doubles: number[] }).doubles, [1]);
});
