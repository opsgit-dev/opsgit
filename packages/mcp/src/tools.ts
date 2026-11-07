/**
 * The tool functions behind the opsgit MCP server. Each one takes a flags repository root and returns plain data,
 * so they can be tested without a transport and reused by other integrations.
 */
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { bucket, evaluate, isSegmentCondition, matchCondition, validateFlag, KEY_PATTERN, type Condition, type Context, type Flag } from "@opsgit/core";
import { errorsOf, loadAll, resolveRoot, runFixtures, type Problem } from "opsgit-flags/lib";
import { renderDiff } from "opsgit-flags/diff";

export { resolveRoot };

export interface FlagSummary {
  key: string;
  enabled: boolean;
  default: unknown;
  rules: number;
  owner?: string;
  expires?: string;
  client: boolean;
  description?: string;
}

export async function listFlags(root: string): Promise<{ flags: FlagSummary[]; segments: string[]; problems: Problem[] }> {
  const { flags, segments, problems } = await loadAll(root);
  return {
    flags: Object.values(flags).map((f) => ({
      key: f.key, enabled: f.enabled, default: f.default, rules: f.rules?.length ?? 0,
      owner: f.owner, expires: f.expires, client: f.client === true, description: f.description,
    })),
    segments: Object.keys(segments),
    problems,
  };
}

export async function getFlag(root: string, key: string): Promise<{ flag?: Flag; file: string; problems: Problem[] }> {
  const { flags, problems } = await loadAll(root);
  return { flag: flags[key], file: `flags/${key}.json`, problems: problems.filter((p) => p.file === `flags/${key}.json`) };
}

export interface CreateInput {
  key: string;
  default?: unknown;
  description?: string;
  owner?: string;
  expires?: string;
  client?: boolean;
}

/** Writes flags/<key>.json, disabled with no rules, exactly as `opsgit-flags create` does. */
export async function createFlag(root: string, input: CreateInput): Promise<{ file: string; flag: Record<string, unknown>; problems: Problem[] }> {
  if (!KEY_PATTERN.test(input.key)) throw new Error(`"${input.key}" is not a valid key: lowercase letters, digits, "_", ".", "-" only`);
  const file = path.join(root, "flags", `${input.key}.json`);
  if (await exists(file)) throw new Error(`flags/${input.key}.json already exists; use update_flag to change it`);
  const flag: Record<string, unknown> = { $schema: "../schema/flag.schema.json", key: input.key };
  if (input.description) flag.description = input.description;
  if (input.owner) flag.owner = input.owner;
  if (input.expires) flag.expires = input.expires;
  if (input.client) flag.client = true;
  flag.enabled = false;
  flag.default = input.default ?? false;
  flag.rules = [];
  await writeFile(file, JSON.stringify(flag, null, 2) + "\n");
  const { problems } = await loadAll(root);
  return { file: `flags/${input.key}.json`, flag, problems: errorsOf(problems).filter((p) => p.file === `flags/${input.key}.json`) };
}

/** Replaces flags/<key>.json with the given definition, but only if it validates. Returns the problems otherwise. */
export async function updateFlag(root: string, key: string, definition: Record<string, unknown>): Promise<{ written: boolean; file: string; problems: string[] }> {
  const file = path.join(root, "flags", `${key}.json`);
  if (!(await exists(file))) throw new Error(`flags/${key}.json does not exist; use create_flag first`);
  const { segments } = await loadAll(root);
  const next = { $schema: "../schema/flag.schema.json", ...definition, key };
  const { $schema: _s, ...toValidate } = next;
  const problems = validateFlag(toValidate, { fileName: `${key}.json`, segments: Object.keys(segments) });
  if (problems.length > 0) return { written: false, file: `flags/${key}.json`, problems };
  await writeFile(file, JSON.stringify(next, null, 2) + "\n");
  return { written: true, file: `flags/${key}.json`, problems: [] };
}

export async function validateAll(root: string): Promise<{ ok: boolean; flags: number; segments: number; problems: Problem[] }> {
  const { flags, segments, problems } = await loadAll(root);
  return { ok: errorsOf(problems).length === 0, flags: Object.keys(flags).length, segments: Object.keys(segments).length, problems };
}

export interface Explanation {
  key: string;
  enabled: boolean;
  default: unknown;
  context: Context;
  rules: Array<{ name: string; value: unknown; matched: boolean; conditions: Array<{ condition: string; ok: boolean }>; rollout?: string }>;
  result: { value: unknown; reason: string; rule?: string };
}

/** Evaluates one flag for a context and says why, rule by rule. */
export async function explainFlag(root: string, key: string, context: Context): Promise<Explanation> {
  const { flags, segments } = await loadAll(root);
  const flag = flags[key];
  if (!flag) throw new Error(`unknown flag "${key}"`);
  const describe = (c: Condition) => (isSegmentCondition(c) ? `segment ${c.segment}` : `${c.attribute} ${c.operator} ${c.value === undefined ? "" : JSON.stringify(c.value)}`);
  const rules = (flag.rules ?? []).map((rule) => {
    const conditions = rule.conditions.map((c) => ({ condition: describe(c), ok: matchCondition(c, context, segments) }));
    let rollout: string | undefined;
    if (conditions.every((r) => r.ok) && rule.rollout !== undefined && rule.rollout < 100) {
      const by = rule.bucket_by ?? "user_id";
      const v = context[by];
      if (v === undefined || v === null) rollout = `${rule.rollout}%: no "${by}" in context, excluded`;
      else {
        const b = bucket(flag.key, String(v));
        rollout = `${rule.rollout}%: bucket ${b.toFixed(2)}, ${b < rule.rollout ? "included" : "excluded"}`;
      }
    }
    return { name: rule.name, value: rule.value, matched: conditions.every((r) => r.ok), conditions, rollout };
  });
  const r = evaluate(flag, context, segments);
  return { key: flag.key, enabled: flag.enabled, default: flag.default, context, rules, result: { value: r.value, reason: r.reason, rule: r.rule } };
}

export async function checkFixtures(root: string) {
  return runFixtures(root);
}

/** The pull-request preview as markdown, comparing the working tree with a git ref (default origin/main). */
export async function previewDiff(root: string, base = "origin/main"): Promise<{ base: string; markdown: string }> {
  return { base, markdown: await renderDiff(base, root) };
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
