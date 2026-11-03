/**
 * Prints a Markdown summary of how flags differ between a git ref and the
 * working tree. Used by the PR preview comment: `node scripts/diff.ts origin/main`.
 */
import { execFileSync } from "node:child_process";
import {
  isSegmentCondition,
  type Condition,
  type Flag,
  type JsonValue,
  type Rule,
  type Segment,
} from "../packages/core/src/index.ts";
import { loadAll, ROOT } from "./lib.ts";

export const MARKER = "<!-- opsgit-flags-preview -->";

const baseRef = process.argv[2];
if (!baseRef) {
  console.error("usage: node scripts/diff.ts <base-ref>");
  process.exit(2);
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function loadFromRef<T extends { key: string }>(ref: string, dir: string): Record<string, T> {
  const out: Record<string, T> = {};
  let listing = "";
  try {
    listing = git(["ls-tree", "--name-only", ref, `${dir}/`]);
  } catch {
    return out;
  }
  for (const file of listing.split("\n").filter((f) => f.endsWith(".json"))) {
    try {
      const { $schema: _s, ...parsed } = JSON.parse(git(["show", `${ref}:${file}`]));
      if (typeof parsed.key === "string") out[parsed.key] = parsed as T;
    } catch {
      // unparseable on base; treat as absent
    }
  }
  return out;
}

const j = (v: unknown) => `\`${JSON.stringify(v)}\``;

function describeCondition(c: Condition): string {
  if (isSegmentCondition(c)) return `segment **${c.segment}**`;
  if (c.operator === "exists") return `${c.attribute} exists`;
  return `${c.attribute} ${c.operator} ${JSON.stringify(c.value)}`;
}

function describeRule(r: Rule): string {
  const rollout = r.rollout !== undefined && r.rollout < 100 ? ` to ${r.rollout}% (by ${r.bucket_by ?? "user_id"})` : "";
  return `${r.conditions.map(describeCondition).join(" AND ")} → ${j(r.value)}${rollout}`;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const WARN = " ⚠️";

function diffFlag(before: Flag, after: Flag): string[] {
  const lines: string[] = [];
  if (before.enabled !== after.enabled) {
    lines.push(`- **enabled**: ${before.enabled} → **${after.enabled}**${after.enabled ? WARN : ""}`);
  }
  if (!same(before.default, after.default)) lines.push(`- **default**: ${j(before.default)} → ${j(after.default)}`);
  if (before.expires !== after.expires) lines.push(`- **expires**: ${before.expires ?? "never"} → ${after.expires ?? "never"}`);
  if (before.description !== after.description) lines.push(`- description updated`);
  if (before.owner !== after.owner) lines.push(`- **owner**: ${before.owner ?? "none"} → ${after.owner ?? "none"}`);

  const beforeRules = new Map((before.rules ?? []).map((r) => [r.name, r]));
  const afterRules = new Map((after.rules ?? []).map((r) => [r.name, r]));
  for (const [name, rule] of afterRules) {
    const old = beforeRules.get(name);
    if (!old) {
      lines.push(`- rule **${name}** added: ${describeRule(rule)}`);
      continue;
    }
    const oldRollout = old.rollout ?? 100;
    const newRollout = rule.rollout ?? 100;
    if (oldRollout !== newRollout) {
      lines.push(`- rule **${name}** rollout: ${oldRollout}% → **${newRollout}%**${newRollout > oldRollout ? WARN : ""}`);
    }
    if (!same(old.conditions, rule.conditions)) {
      lines.push(`- rule **${name}** conditions: ${old.conditions.map(describeCondition).join(" AND ")} → ${rule.conditions.map(describeCondition).join(" AND ")}`);
    }
    if (!same(old.value, rule.value)) lines.push(`- rule **${name}** value: ${j(old.value)} → ${j(rule.value)}`);
    if ((old.bucket_by ?? "user_id") !== (rule.bucket_by ?? "user_id")) {
      lines.push(`- rule **${name}** bucket_by: ${old.bucket_by ?? "user_id"} → ${rule.bucket_by ?? "user_id"}${WARN} (re-buckets every user)`);
    }
  }
  for (const name of beforeRules.keys()) {
    if (!afterRules.has(name)) lines.push(`- rule **${name}** removed${WARN}`);
  }
  const beforeOrder = (before.rules ?? []).map((r) => r.name).filter((n) => afterRules.has(n));
  const afterOrder = (after.rules ?? []).map((r) => r.name).filter((n) => beforeRules.has(n));
  if (!same(beforeOrder, afterOrder)) lines.push(`- rule order changed: ${afterOrder.join(", ")} (first match wins)`);
  return lines;
}

function diffSegment(before: Segment, after: Segment): string[] {
  const lines: string[] = [];
  if (!same(before.conditions, after.conditions)) {
    lines.push(`- conditions: ${before.conditions.map(describeCondition).join(" AND ")} → ${after.conditions.map(describeCondition).join(" AND ")}`);
  }
  if (before.description !== after.description) lines.push(`- description updated`);
  return lines;
}

const baseFlags = loadFromRef<Flag>(baseRef, "flags");
const baseSegments = loadFromRef<Segment>(baseRef, "segments");
const { flags, segments } = await loadAll();

const sections: string[] = [];

function section<T extends { key: string }>(
  label: string,
  before: Record<string, T>,
  after: Record<string, T>,
  describeNew: (item: T) => string[],
  diff: (a: T, b: T) => string[],
) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (!a && b) sections.push(`### ➕ ${label} \`${key}\` added\n${describeNew(b).join("\n")}`);
    else if (a && !b) sections.push(`### ➖ ${label} \`${key}\` removed`);
    else if (a && b) {
      const lines = diff(a, b);
      if (lines.length > 0) sections.push(`### ✏️ ${label} \`${key}\` changed\n${lines.join("\n")}`);
    }
  }
}

section("Flag", baseFlags, flags, (f) => [
  `- **enabled**: ${f.enabled}`,
  `- **default**: ${j(f.default)}`,
  ...(f.rules ?? []).map((r) => `- rule **${r.name}**: ${describeRule(r)}`),
  ...(f.expires ? [`- expires ${f.expires}`] : []),
], diffFlag);

section("Segment", baseSegments, segments, (s) => [`- ${s.conditions.map(describeCondition).join(" AND ")}`], diffSegment);

const usedBy = (segmentKey: string) =>
  Object.values(flags).filter((f) => (f.rules ?? []).some((r) => r.conditions.some((c) => isSegmentCondition(c) && c.segment === segmentKey))).map((f) => f.key);
for (const key of Object.keys(segments)) {
  if (baseSegments[key] && !same(baseSegments[key].conditions, segments[key].conditions)) {
    const users = usedBy(key);
    if (users.length) sections.push(`> Segment \`${key}\` is used by: ${users.map((u) => `\`${u}\``).join(", ")}`);
  }
}

const body =
  sections.length === 0
    ? `${MARKER}\n**Flag preview:** no flag or segment changes in this PR.`
    : `${MARKER}\n## Flag preview\n\n${sections.join("\n\n")}\n\n<sub>⚠️ marks changes that widen exposure. Rules evaluate top to bottom, first match wins. Generated by opsgit flags.</sub>`;

console.log(body);
