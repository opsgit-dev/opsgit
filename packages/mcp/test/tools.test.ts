import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkFixtures, createFlag, explainFlag, getFlag, listFlags, updateFlag, validateAll } from "../src/tools.ts";

const SCHEMA = path.resolve(import.meta.dirname, "../../../schema");

async function repo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "opsgit-mcp-"));
  await mkdir(path.join(root, "flags"), { recursive: true });
  await mkdir(path.join(root, "segments"), { recursive: true });
  await mkdir(path.join(root, "tests"), { recursive: true });
  await cp(SCHEMA, path.join(root, "schema"), { recursive: true });
  await writeFile(path.join(root, "segments", "beta_testers.json"), JSON.stringify({ key: "beta_testers", conditions: [{ attribute: "user_id", operator: "in", value: ["u1", "u2"] }] }));
  return root;
}

test("create, list, get", async () => {
  const root = await repo();
  const created = await createFlag(root, { key: "new_checkout", default: false, owner: "@payments", client: true });
  assert.equal(created.file, "flags/new_checkout.json");
  assert.deepEqual(created.problems, []);
  const list = await listFlags(root);
  assert.equal(list.flags.length, 1);
  assert.equal(list.flags[0].key, "new_checkout");
  assert.equal(list.flags[0].client, true);
  assert.deepEqual(list.segments, ["beta_testers"]);
  const got = await getFlag(root, "new_checkout");
  assert.equal(got.flag?.enabled, false);
});

test("create refuses bad keys and duplicates", async () => {
  const root = await repo();
  await assert.rejects(createFlag(root, { key: "Bad Key" }), /not a valid key/);
  await createFlag(root, { key: "dup" });
  await assert.rejects(createFlag(root, { key: "dup" }), /already exists/);
});

test("update validates before writing", async () => {
  const root = await repo();
  await createFlag(root, { key: "f" });
  const bad = await updateFlag(root, "f", { enabled: true, default: false, rules: [{ name: "x", conditions: [{ segment: "nope" }], value: true }] });
  assert.equal(bad.written, false);
  assert.ok(bad.problems.length > 0);
  const good = await updateFlag(root, "f", { enabled: true, default: false, rules: [{ name: "beta", conditions: [{ segment: "beta_testers" }], value: true, rollout: 100 }] });
  assert.equal(good.written, true);
  const v = await validateAll(root);
  assert.equal(v.ok, true);
});

test("explain shows the matched rule and fixtures run", async () => {
  const root = await repo();
  await createFlag(root, { key: "f" });
  await updateFlag(root, "f", { enabled: true, default: false, rules: [{ name: "beta", conditions: [{ segment: "beta_testers" }], value: true }] });
  const ex = await explainFlag(root, "f", { user_id: "u1" });
  assert.equal(ex.result.value, true);
  assert.equal(ex.result.rule, "beta");
  assert.equal(ex.rules[0].matched, true);
  const miss = await explainFlag(root, "f", { user_id: "u9" });
  assert.equal(miss.result.value, false);
  await writeFile(path.join(root, "tests", "f.json"), JSON.stringify([{ name: "beta user", flag: "f", context: { user_id: "u1" }, expect: { value: true, rule: "beta" } }]));
  const fx = await checkFixtures(root);
  assert.equal(fx.total, 1);
  assert.deepEqual(fx.failures, []);
});
