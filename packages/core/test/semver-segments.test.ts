import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSemver, evaluate, parseSemver, validateFlag, validateSegment, type Flag, type Segments } from "../src/index.ts";

test("parseSemver accepts lenient forms and rejects junk", () => {
  assert.deepEqual(parseSemver("v1.2.3-beta.1+build.5"), { major: 1, minor: 2, patch: 3, prerelease: ["beta", "1"] });
  assert.deepEqual(parseSemver("2"), { major: 2, minor: 0, patch: 0, prerelease: [] });
  assert.deepEqual(parseSemver(3.1), { major: 3, minor: 1, patch: 0, prerelease: [] });
  assert.equal(parseSemver("1.2.x"), null);
  assert.equal(parseSemver("latest"), null);
  assert.equal(parseSemver(""), null);
});

test("compareSemver follows semver precedence", () => {
  const order = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0"];
  for (let i = 1; i < order.length; i++) {
    assert.ok(compareSemver(parseSemver(order[i - 1])!, parseSemver(order[i])!) < 0, `${order[i - 1]} < ${order[i]}`);
  }
  assert.equal(compareSemver(parseSemver("1.2.0")!, parseSemver("v1.2")!), 0);
});

test("semver operators in rules", () => {
  const flag: Flag = {
    key: "force_upgrade",
    enabled: true,
    default: false,
    rules: [{ name: "old-app", conditions: [{ attribute: "app_version", operator: "semver_lt", value: "2.3.0" }], value: true }],
  };
  assert.equal(evaluate(flag, { app_version: "2.2.9" }).value, true);
  assert.equal(evaluate(flag, { app_version: "2.3.0-beta.1" }).value, true, "prerelease of 2.3.0 is below 2.3.0");
  assert.equal(evaluate(flag, { app_version: "2.3.0" }).value, false);
  assert.equal(evaluate(flag, { app_version: "10.0" }).value, false);
  assert.equal(evaluate(flag, { app_version: "nightly" }).value, false, "unparseable version never matches");
  assert.equal(evaluate(flag, {}).value, false);
});

test("segment conditions resolve against the bundle's segments", () => {
  const segments: Segments = {
    beta_testers: {
      key: "beta_testers",
      conditions: [
        { attribute: "email", operator: "ends_with", value: "@example.com" },
        { attribute: "plan", operator: "in", value: ["pro", "enterprise"] },
      ],
    },
  };
  const flag: Flag = {
    key: "f",
    enabled: true,
    default: "off",
    rules: [{ name: "beta", conditions: [{ segment: "beta_testers" }, { attribute: "environment", operator: "eq", value: "production" }], value: "on" }],
  };
  assert.equal(evaluate(flag, { email: "a@example.com", plan: "pro", environment: "production" }, segments).value, "on");
  assert.equal(evaluate(flag, { email: "a@example.com", plan: "free", environment: "production" }, segments).value, "off");
  assert.equal(evaluate(flag, { email: "a@example.com", plan: "pro", environment: "staging" }, segments).value, "off");
  assert.equal(evaluate(flag, { email: "a@example.com", plan: "pro", environment: "production" }).value, "off", "unknown segment never matches");
});

test("validateFlag checks expires and segment references", () => {
  const base = { key: "x", enabled: true, default: 1 };
  assert.deepEqual(validateFlag({ ...base, expires: "2026-12-31" }), []);
  assert.match(validateFlag({ ...base, expires: "soon" }).join(), /expires: must be an ISO date/);
  const withSeg = { ...base, rules: [{ name: "r", conditions: [{ segment: "vips" }], value: 2 }] };
  assert.deepEqual(validateFlag(withSeg), [], "segment references are not checked without a segment list");
  assert.deepEqual(validateFlag(withSeg, { segments: ["vips"] }), []);
  assert.match(validateFlag(withSeg, { segments: ["others"] }).join(), /unknown segment "vips"/);
  assert.match(validateFlag({ ...base, rules: [{ name: "r", conditions: [{ segment: "vips", attribute: "a" }], value: 2 }] }).join(), /takes only "segment"/);
  assert.match(validateFlag({ ...base, rules: [{ name: "r", conditions: [{ attribute: "v", operator: "semver_gte", value: "banana" }], value: 2 }] }).join(), /needs a version string/);
});

test("validateSegment", () => {
  assert.deepEqual(validateSegment({ key: "vips", description: "x", conditions: [{ attribute: "plan", operator: "eq", value: "vip" }] }, { fileName: "vips.json" }), []);
  assert.match(validateSegment({ key: "vips", conditions: [] }).join(), /non-empty array/);
  assert.match(validateSegment({ key: "vips", conditions: [{ segment: "other" }] }).join(), /cannot reference other segments/);
  assert.match(validateSegment({ key: "vips", conditions: [{ attribute: "a", operator: "eq", value: 1 }] }, { fileName: "other.json" }).join(), /does not match file name/);
});
