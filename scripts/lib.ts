import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateFlag, type Flag } from "../packages/core/src/index.ts";

export const FLAGS_DIR = path.resolve(import.meta.dirname, "..", "flags");

export interface Problem {
  file: string;
  message: string;
}

export interface LoadResult {
  flags: Record<string, Flag>;
  problems: Problem[];
}

/** Reads every file in /flags, validates it, and returns the clean flags plus every problem found. */
export async function loadFlags(dir: string = FLAGS_DIR): Promise<LoadResult> {
  const entries = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));
  const flags: Record<string, Flag> = {};
  const problems: Problem[] = [];

  for (const entry of entries) {
    const file = path.join("flags", entry.name);
    if (entry.name === "README.md" || entry.name.startsWith(".")) continue;
    if (!entry.name.endsWith(".json")) {
      problems.push({ file, message: "only .json files belong in /flags" });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path.join(dir, entry.name), "utf8"));
    } catch (err) {
      problems.push({ file, message: `invalid JSON: ${(err as Error).message}` });
      continue;
    }

    const errors = validateFlag(parsed, { fileName: entry.name });
    for (const message of errors) problems.push({ file, message });
    if (errors.length === 0) {
      const { $schema: _ignored, ...flag } = parsed as Flag & { $schema?: string };
      flags[flag.key] = flag;
    }
  }
  return { flags, problems };
}

/** Prints problems as GitHub Actions annotations when running in CI, plain text otherwise. */
export function report(problems: Problem[]): void {
  const ci = process.env.GITHUB_ACTIONS === "true";
  for (const p of problems) {
    if (ci) console.log(`::error file=${p.file}::${p.message}`);
    else console.error(`${p.file}: ${p.message}`);
  }
}
