/**
 * Runs the expectation fixtures in /tests against the current flags.
 * Each file holds an array of cases:
 *   { "name": "...", "flag": "key", "context": {...}, "expect": { "value": ..., "reason": "...", "rule": "..." } }
 * Any field in `expect` that is present must match exactly.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { evaluate, type Context, type Evaluation } from "../packages/core/src/index.ts";
import { errorsOf, loadAll, report, TESTS_DIR, type Problem } from "./lib.ts";

interface Case {
  name?: string;
  flag: string;
  context?: Context;
  expect: Partial<Pick<Evaluation, "value" | "reason" | "rule">>;
}

const { flags, segments, problems } = await loadAll();
if (errorsOf(problems).length > 0) {
  report(errorsOf(problems));
  console.error("fix validation errors before running fixtures");
  process.exit(1);
}

let files: string[] = [];
try {
  files = (await readdir(TESTS_DIR)).filter((f) => f.endsWith(".json")).sort();
} catch {
  console.log("no /tests directory, nothing to check");
  process.exit(0);
}

const failures: Problem[] = [];
let total = 0;

for (const name of files) {
  const file = `tests/${name}`;
  let cases: Case[];
  try {
    const parsed = JSON.parse(await readFile(path.join(TESTS_DIR, name), "utf8"));
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
    if (mismatches.length > 0) {
      failures.push({ file, message: `${label} (${c.flag} with ${JSON.stringify(c.context ?? {})}): ${mismatches.join("; ")}` });
    }
  });
}

report(failures);
if (failures.length > 0) {
  console.error(`\n${failures.length} of ${total} fixture(s) failed`);
  process.exit(1);
}
console.log(`${total} fixture(s) passed across ${files.length} file(s)`);
