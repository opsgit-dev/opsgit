import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, evaluateAll, bucket, type Flag, type Bundle } from "../src/index.ts";

const checkout: Flag = {
  key: "new_checkout_v2",
  enabled: true,
  default: false,
  rules: [
    {
      name: "staging-everyone",
      conditions: [{ attribute: "environment", operator: "eq", value: "staging" }],
      value: true,
    },
    {
      name: "north-america-half",
      conditions: [{ attribute: "country", operator: "in", value: ["US", "CA"] }],
      rollout: 50,
      value: true,
    },
  ],
};

test("disabled flag serves default with FLAG_DISABLED", () => {
  const result = evaluate({ ...checkout, enabled: false }, { environment: "staging" });
  assert.deepEqual(result, { key: "new_checkout_v2", value: false, reason: "FLAG_DISABLED" });
});

test("first matching rule wins", () => {
  const result = evaluate(checkout, { environment: "staging", country: "US", user_id: "u1" });
  assert.equal(result.reason, "RULE_MATCH");
  assert.equal(result.rule, "staging-everyone");
  assert.equal(result.value, true);
});

test("no match serves default with DEFAULT", () => {
  const result = evaluate(checkout, { environment: "production", country: "DE", user_id: "u1" });
  assert.deepEqual(result, { key: "new_checkout_v2", value: false, reason: "DEFAULT" });
});

test("rollout is deterministic per user and flag", () => {
  const ctx = { environment: "production", country: "US", user_id: "usr_98123" };
  const first = evaluate(checkout, ctx);
  for (let i = 0; i < 20; i++) assert.deepEqual(evaluate(checkout, ctx), first);
});

test("rollout splits roughly by percentage", () => {
  let hits = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) {
    const r = evaluate(checkout, { environment: "production", country: "CA", user_id: `user-${i}` });
    if (r.value === true) hits++;
  }
  const share = hits / n;
  assert.ok(share > 0.47 && share < 0.53, `expected ~50%, got ${(share * 100).toFixed(1)}%`);
});

test("rollout never matches when the bucketing attribute is missing", () => {
  const result = evaluate(checkout, { environment: "production", country: "US" });
  assert.equal(result.reason, "DEFAULT");
});

test("bucket_by overrides the bucketing attribute", () => {
  const flag: Flag = {
    key: "f",
    enabled: true,
    default: "off",
    rules: [{ name: "r", conditions: [{ attribute: "plan", operator: "exists" }], rollout: 50, bucket_by: "org_id", value: "on" }],
  };
  const a = evaluate(flag, { plan: "pro", org_id: "org-1", user_id: "x" });
  const b = evaluate(flag, { plan: "pro", org_id: "org-1", user_id: "y" });
  assert.equal(a.value, b.value);
});

test("different flags bucket the same user independently", () => {
  const users = Array.from({ length: 2000 }, (_, i) => `u${i}`);
  const agree = users.filter((u) => (bucket("flag_a", u) < 50) === (bucket("flag_b", u) < 50)).length;
  assert.ok(agree > 900 && agree < 1100, `expected ~50% agreement, got ${agree}`);
});

test("operators", () => {
  const mk = (operator: any, value?: any): Flag => ({
    key: "op",
    enabled: true,
    default: "no",
    rules: [{ name: "r", conditions: [{ attribute: "a", operator, ...(value === undefined ? {} : { value }) }], value: "yes" }],
  });
  const yes = (f: Flag, a: any) => assert.equal(evaluate(f, { a }).value, "yes", `${f.rules![0].conditions[0].operator} ${JSON.stringify(a)}`);
  const no = (f: Flag, a: any) => assert.equal(evaluate(f, { a }).value, "no", `${f.rules![0].conditions[0].operator} ${JSON.stringify(a)}`);

  yes(mk("eq", "x"), "x"); no(mk("eq", "x"), "y");
  yes(mk("eq", 42), "42"); // loose scalar compare
  yes(mk("neq", "x"), "y"); no(mk("neq", "x"), "x"); no(mk("neq", "x"), undefined);
  yes(mk("in", ["a", "b"]), "b"); no(mk("in", ["a", "b"]), "c");
  yes(mk("not_in", ["a"]), "b"); no(mk("not_in", ["a"]), "a"); no(mk("not_in", ["a"]), undefined);
  yes(mk("contains", "ell"), "hello"); no(mk("contains", "z"), "hello");
  yes(mk("starts_with", "he"), "hello"); no(mk("starts_with", "lo"), "hello");
  yes(mk("ends_with", "lo"), "hello"); no(mk("ends_with", "he"), "hello");
  yes(mk("gt", 5), 6); no(mk("gt", 5), 5); yes(mk("gt", 5), "7"); no(mk("gt", 5), "abc");
  yes(mk("gte", 5), 5); yes(mk("lt", 5), 4); yes(mk("lte", 5), 5); no(mk("lte", 5), 6);
  yes(mk("exists"), "anything"); yes(mk("exists"), false); no(mk("exists"), null); no(mk("exists"), undefined);
});

test("evaluateAll evaluates every flag in the bundle", () => {
  const bundle: Bundle = {
    version: 1,
    generated_at: "2026-10-31T00:00:00Z",
    etag: "abc",
    flags: { new_checkout_v2: checkout, banner: { key: "banner", enabled: false, default: null } },
  };
  const all = evaluateAll(bundle, { environment: "staging" });
  assert.equal(all.new_checkout_v2.value, true);
  assert.equal(all.banner.reason, "FLAG_DISABLED");
});

test("murmur3 matches reference vectors", async () => {
  const { murmur3 } = await import("../src/hash.ts");
  assert.equal(murmur3(""), 0);
  assert.equal(murmur3("", 1), 0x514e28b7);
  assert.equal(murmur3("hello"), 0x248bfa47);
  assert.equal(murmur3("hello, world"), 0x149bbb7f);
  assert.equal(murmur3("The quick brown fox jumps over the lazy dog"), 0x2e4ff723);
});
