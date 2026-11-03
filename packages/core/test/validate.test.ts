import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFlag } from "../src/index.ts";

const valid = {
  key: "new_checkout_v2",
  description: "Redesigned checkout",
  enabled: true,
  default: false,
  rules: [
    { name: "staging", conditions: [{ attribute: "environment", operator: "eq", value: "staging" }], value: true },
    { name: "na", conditions: [{ attribute: "country", operator: "in", value: ["US"] }], rollout: 25, value: true },
  ],
};

test("valid flag has no errors", () => {
  assert.deepEqual(validateFlag(valid, { fileName: "new_checkout_v2.json" }), []);
});

test("key must match file name", () => {
  const errors = validateFlag(valid, { fileName: "other.json" });
  assert.ok(errors.some((e) => e.includes("does not match file name")), errors.join("\n"));
});

test("rejects bad keys", () => {
  for (const key of ["", "Has Caps", "with space", "a".repeat(101), "_leading"]) {
    assert.ok(validateFlag({ ...valid, key }).some((e) => e.startsWith("key:")), `key ${JSON.stringify(key)}`);
  }
});

test("catches typos in field names", () => {
  const errors = validateFlag({ ...valid, defualt: true });
  assert.ok(errors.some((e) => e.includes('unknown field "defualt"')));
});

test("requires enabled and default", () => {
  const errors = validateFlag({ key: "x" });
  assert.ok(errors.some((e) => e.startsWith("enabled:")));
  assert.ok(errors.some((e) => e.startsWith("default:")));
});

test("validates rule shape", () => {
  const errors = validateFlag({
    key: "x",
    enabled: true,
    default: 1,
    rules: [
      { name: "a", conditions: [], value: 2 },
      { name: "a", conditions: [{ attribute: "u", operator: "in", value: "not-a-list" }], rollout: 150, value: 2 },
      { name: "b", conditions: [{ attribute: "u", operator: "exists", value: 1 }], value: 2 },
      { name: "c", conditions: [{ attribute: "u", operator: "between", value: 1 }], value: 2 },
      { name: "d", conditions: [{ attribute: "u", operator: "eq", value: [1] }] },
    ],
  });
  const text = errors.join("\n");
  assert.match(text, /rules\[0\]\.conditions: must be a non-empty array/);
  assert.match(text, /rules\[1\]\.name: duplicate rule name "a"/);
  assert.match(text, /rules\[1\]\.conditions\[0\]\.value: "in" needs a non-empty array/);
  assert.match(text, /rules\[1\]\.rollout: must be a number between 0 and 100/);
  assert.match(text, /rules\[2\]\.conditions\[0\]\.value: "exists" takes no value/);
  assert.match(text, /rules\[3\]\.conditions\[0\]\.operator: must be one of/);
  assert.match(text, /rules\[4\]\.value: required/);
  assert.match(text, /rules\[4\]\.conditions\[0\]\.value: "eq" needs a string/);
});

test("client must be a boolean", () => {
  assert.deepEqual(validateFlag({ ...valid, client: true }), []);
  assert.match(validateFlag({ ...valid, client: "yes" }).join(), /client: must be true or false/);
});
