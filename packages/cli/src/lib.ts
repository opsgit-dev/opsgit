import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { evaluate, validateFlag, validateSegment, type Context, type Evaluation, type Flag, type Segments } from "@opsgit/core";

export interface Problem {
  file: string;
  message: string;
  level?: "error" | "warning";
}

export interface Loaded {
  flags: Record<string, Flag>;
  segments: Segments;
  problems: Problem[];
}

/**
 * The flags repository root: --root, then $OPSGIT_ROOT, then the nearest
 * ancestor of the current directory that contains a flags/ folder.
 */
export function resolveRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  if (process.env.OPSGIT_ROOT) return path.resolve(process.env.OPSGIT_ROOT);
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, "flags"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

interface JsonFile {
  name: string;
  file: string;
  parsed?: unknown;
  error?: string;
}

async function readJsonDir(dir: string, label: string): Promise<JsonFile[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: JsonFile[] = [];
  for (const entry of entries.filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = `${label}/${entry.name}`;
    if (entry.name === "README.md" || entry.name.startsWith(".")) continue;
    if (!entry.name.endsWith(".json")) {
      out.push({ name: entry.name, file, error: `only .json files belong in /${label}` });
      continue;
    }
    try {
      out.push({ name: entry.name, file, parsed: JSON.parse(await readFile(path.join(dir, entry.name), "utf8")) });
    } catch (err) {
      out.push({ name: entry.name, file, error: `invalid JSON: ${(err as Error).message}` });
    }
  }
  return out;
}

function strip<T>(parsed: unknown): T {
  const { $schema: _ignored, ...rest } = parsed as Record<string, unknown>;
  return rest as T;
}

/** Days from today until an ISO date; negative when it is in the past. */
export function daysUntil(iso: string, now = new Date()): number {
  return Math.floor((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

/** Reads and validates <root>/segments and <root>/flags. Returns clean data plus every problem found. */
export async function loadAll(root: string): Promise<Loaded> {
  const problems: Problem[] = [];
  const segments: Segments = {};
  const flags: Record<string, Flag> = {};

  for (const f of await readJsonDir(path.join(root, "segments"), "segments")) {
    if (f.error) {
      problems.push({ file: f.file, message: f.error });
      continue;
    }
    const errors = validateSegment(f.parsed, { fileName: f.name });
    for (const message of errors) problems.push({ file: f.file, message });
    if (errors.length === 0) {
      const segment = strip<Segments[string]>(f.parsed);
      segments[segment.key] = segment;
    }
  }

  for (const f of await readJsonDir(path.join(root, "flags"), "flags")) {
    if (f.error) {
      problems.push({ file: f.file, message: f.error });
      continue;
    }
    const errors = validateFlag(f.parsed, { fileName: f.name, segments: Object.keys(segments) });
    for (const message of errors) problems.push({ file: f.file, message });
    if (errors.length === 0) {
      const flag = strip<Flag>(f.parsed);
      flags[flag.key] = flag;
      if (flag.expires) {
        const days = daysUntil(flag.expires);
        if (days < 0) problems.push({ file: f.file, level: "warning", message: `flag expired ${-days} day(s) ago (${flag.expires}); remove it or extend "expires"` });
        else if (days <= 14) problems.push({ file: f.file, level: "warning", message: `flag expires in ${days} day(s) (${flag.expires})` });
      }
    }
  }
  return { flags, segments, problems };
}

export function errorsOf(problems: Problem[]): Problem[] {
  return problems.filter((p) => p.level !== "warning");
}

/** Prints problems as GitHub Actions annotations when running in CI, plain text otherwise. */
export function report(problems: Problem[]): void {
  const ci = process.env.GITHUB_ACTIONS === "true";
  for (const p of problems) {
    const level = p.level ?? "error";
    if (ci) console.log(`::${level} file=${p.file}::${p.message}`);
    else console.error(`${level}: ${p.file}: ${p.message}`);
  }
}

/** JSON with object keys sorted at every level, so hashes only change when content does. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export const TEMPLATES_DIR = path.resolve(import.meta.dirname, "..", "templates");

interface FixtureCase {
  name?: string;
  flag: string;
  context?: Context;
  expect: Partial<Pick<Evaluation, "value" | "reason" | "rule">>;
}

export interface FixtureRun {
  /** Number of fixture files found; -1 when there is no tests/ directory. */
  files: number;
  total: number;
  failures: Problem[];
  /** Validation errors that stopped the run before any fixture executed. */
  blocked: Problem[];
}

/**
 * Runs the expectation fixtures in <root>/tests against the current flags.
 * Each file holds an array of cases: { "name", "flag", "context", "expect": { "value", "reason", "rule" } }.
 * Any field present in `expect` must match exactly.
 */
export async function runFixtures(root: string): Promise<FixtureRun> {
  const { flags, segments, problems } = await loadAll(root);
  const blocked = errorsOf(problems);
  if (blocked.length > 0) return { files: 0, total: 0, failures: [], blocked };

  const dir = path.join(root, "tests");
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return { files: -1, total: 0, failures: [], blocked: [] };
  }

  const failures: Problem[] = [];
  let total = 0;
  for (const name of names) {
    const file = `tests/${name}`;
    let cases: FixtureCase[];
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, name), "utf8"));
      cases = Array.isArray(parsed) ? parsed : parsed.cases;
      if (!Array.isArray(cases)) throw new Error("expected an array of cases");
    } catch (err) {
      failures.push({ file, message: `cannot read fixtures: ${(err as Error).message}` });
      continue;
    }
    cases.forEach((c, i) => {
      total++;
      const label = c.name ?? `case ${i + 1}`;
      const flag = flags[c.flag];
      if (!flag) {
        failures.push({ file, message: `${label}: unknown flag "${c.flag}"` });
        return;
      }
      const got = evaluate(flag, c.context ?? {}, segments);
      const mismatches: string[] = [];
      for (const field of ["value", "reason", "rule"] as const) {
        if (field in c.expect && JSON.stringify(c.expect[field]) !== JSON.stringify(got[field])) {
          mismatches.push(`${field}: expected ${JSON.stringify(c.expect[field])}, got ${JSON.stringify(got[field])}`);
        }
      }
      if (mismatches.length > 0) failures.push({ file, message: `${label} (${c.flag} with ${JSON.stringify(c.context ?? {})}): ${mismatches.join("; ")}` });
    });
  }
  return { files: names.length, total, failures, blocked: [] };
}
