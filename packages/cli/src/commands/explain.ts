import { parseArgs } from "node:util";
import { bucket, evaluate, isSegmentCondition, matchCondition, type Condition, type Context, type Scalar } from "@opsgit/core";
import { errorsOf, fail, loadAll, report } from "../lib.ts";

function parseScalar(raw: string): Scalar {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

export async function explain(args: string[], root: string): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { c: { type: "string", multiple: true, default: [] }, context: { type: "string" } },
  });
  const key = positionals[0];
  if (!key) fail("usage: opsgit-flags explain <key> [-c attr=value ...] [--context '{...}']");

  const context: Context = values.context ? JSON.parse(values.context) : {};
  for (const pair of values.c!) {
    const eq = pair.indexOf("=");
    if (eq < 1) fail(`-c expects attr=value, got "${pair}"`);
    context[pair.slice(0, eq)] = parseScalar(pair.slice(eq + 1));
  }

  const { flags, segments, problems } = await loadAll(root);
  report(errorsOf(problems));
  const flag = flags[key];
  if (!flag) fail(`unknown flag "${key}"`);

  const describe = (c: Condition) => (isSegmentCondition(c) ? `segment ${c.segment}` : `${c.attribute} ${c.operator} ${c.value === undefined ? "" : JSON.stringify(c.value)}`);
  console.log(`${flag.key}: ${flag.enabled ? "enabled" : "DISABLED"}, default ${JSON.stringify(flag.default)}`);
  console.log(`context: ${JSON.stringify(context)}\n`);

  for (const rule of flag.rules ?? []) {
    const results = rule.conditions.map((c) => ({ c, ok: matchCondition(c, context, segments) }));
    let rolloutNote = "";
    if (results.every((r) => r.ok) && rule.rollout !== undefined && rule.rollout < 100) {
      const by = rule.bucket_by ?? "user_id";
      const v = context[by];
      if (v === undefined || v === null) rolloutNote = `  rollout ${rule.rollout}%: no "${by}" in context → excluded`;
      else {
        const b = bucket(flag.key, String(v));
        rolloutNote = `  rollout ${rule.rollout}%: bucket ${b.toFixed(2)} → ${b < rule.rollout ? "included" : "excluded"}`;
      }
    }
    console.log(`rule ${rule.name} → ${JSON.stringify(rule.value)}`);
    for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${describe(r.c)}`);
    if (rolloutNote) console.log(rolloutNote);
  }

  const result = evaluate(flag, context, segments);
  console.log(`\nresult: ${JSON.stringify(result.value)}  (${result.reason}${result.rule ? `: ${result.rule}` : ""})`);
}
