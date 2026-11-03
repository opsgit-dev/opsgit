#!/usr/bin/env node
/**
 * opsgit-flags: create, list, validate, and explain flags from the terminal.
 */
import { execFileSync } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  evaluate,
  isSegmentCondition,
  matchCondition,
  bucket,
  KEY_PATTERN,
  type Condition,
  type Context,
  type Scalar,
} from "../packages/core/src/index.ts";
import { errorsOf, FLAGS_DIR, loadAll, report, ROOT } from "./lib.ts";

const HELP = `opsgit-flags <command>

  create <key>        Create flags/<key>.json
      --default <json>        value served by default (default: false)
      --description <text>
      --owner <name>
      --expires <YYYY-MM-DD>
      --pr                    branch, commit, push, and open a pull request
  list                Show every flag with its state
  validate            Check all flag and segment files
  explain <key>       Show how a flag evaluates for a context
      -c key=value            context attribute (repeatable)
      --context <json>        context as a JSON object
  help
`;

const [command, ...rest] = process.argv.slice(2);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseScalar(raw: string): Scalar {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

async function create(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      default: { type: "string", default: "false" },
      description: { type: "string" },
      owner: { type: "string" },
      expires: { type: "string" },
      pr: { type: "boolean", default: false },
    },
  });
  const key = positionals[0];
  if (!key) fail("usage: opsgit-flags create <key> [--default <json>] [--description <text>] [--owner <name>] [--expires <date>] [--pr]");
  if (!KEY_PATTERN.test(key)) fail(`"${key}" is not a valid key: lowercase letters, digits, "_", ".", "-" only`);

  let defaultValue: unknown;
  try {
    defaultValue = JSON.parse(values.default!);
  } catch {
    fail(`--default must be JSON, e.g. --default false, --default 100, --default '"blue"'`);
  }

  const file = path.join(FLAGS_DIR, `${key}.json`);
  try {
    await access(file);
    fail(`flags/${key}.json already exists`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const flag: Record<string, unknown> = { $schema: "../schema/flag.schema.json", key };
  if (values.description) flag.description = values.description;
  if (values.owner) flag.owner = values.owner;
  if (values.expires) flag.expires = values.expires;
  flag.enabled = false;
  flag.default = defaultValue;
  flag.rules = [];
  await writeFile(file, JSON.stringify(flag, null, 2) + "\n");

  const { problems } = await loadAll();
  const mine = errorsOf(problems).filter((p) => p.file === `flags/${key}.json`);
  if (mine.length) {
    report(mine);
    process.exit(1);
  }
  console.log(`created flags/${key}.json (disabled, default ${JSON.stringify(defaultValue)})`);

  if (!values.pr) {
    console.log(`\nnext:\n  edit flags/${key}.json to add rules\n  git checkout -b flags/${key} && git add flags/${key}.json && git commit -m "Add flag ${key}"\n  gh pr create --fill`);
    return;
  }

  const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, stdio: "inherit" });
  const branch = `flags/${key}`;
  git("checkout", "-b", branch);
  git("add", `flags/${key}.json`);
  git("commit", "-m", `Add flag ${key}${values.description ? `\n\n${values.description}` : ""}`);
  git("push", "-u", "origin", branch);
  execFileSync("gh", ["pr", "create", "--fill", "--title", `Add flag ${key}`], { cwd: ROOT, stdio: "inherit" });
}

async function list() {
  const { flags, problems } = await loadAll();
  report(errorsOf(problems));
  const rows = Object.values(flags).map((f) => ({
    key: f.key,
    state: f.enabled ? "enabled" : "disabled",
    default: JSON.stringify(f.default),
    rules: String(f.rules?.length ?? 0),
    owner: f.owner ?? "",
    expires: f.expires ?? "",
  }));
  if (rows.length === 0) return console.log("no flags");
  const cols = ["key", "state", "default", "rules", "owner", "expires"] as const;
  const width = Object.fromEntries(cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => r[c].length))]));
  const line = (r: Record<string, string>) => cols.map((c) => r[c].padEnd(width[c])).join("  ").trimEnd();
  console.log(line(Object.fromEntries(cols.map((c) => [c, c.toUpperCase()]))));
  for (const r of rows) console.log(line(r));
}

async function validate() {
  const { flags, problems } = await loadAll();
  report(problems);
  if (errorsOf(problems).length) process.exit(1);
  console.log(`${Object.keys(flags).length} flag(s) valid`);
}

async function explain(args: string[]) {
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

  const { flags, segments, problems } = await loadAll();
  report(errorsOf(problems));
  const flag = flags[key];
  if (!flag) fail(`unknown flag "${key}"`);

  const describe = (c: Condition) => (isSegmentCondition(c) ? `segment ${c.segment}` : `${c.attribute} ${c.operator} ${c.value === undefined ? "" : JSON.stringify(c.value)}`);
  console.log(`${flag.key}: ${flag.enabled ? "enabled" : "DISABLED"}, default ${JSON.stringify(flag.default)}`);
  console.log(`context: ${JSON.stringify(context)}\n`);

  for (const rule of flag.rules ?? []) {
    const results = rule.conditions.map((c) => ({ c, ok: matchCondition(c, context, segments) }));
    const allOk = results.every((r) => r.ok);
    let rolloutNote = "";
    if (allOk && rule.rollout !== undefined && rule.rollout < 100) {
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

switch (command) {
  case "create":
    await create(rest);
    break;
  case "list":
    await list();
    break;
  case "validate":
    await validate();
    break;
  case "explain":
    await explain(rest);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    console.log(HELP);
    break;
  default:
    fail(`unknown command "${command}"\n\n${HELP}`);
}
