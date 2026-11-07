/**
 * Runs the expectation fixtures in <root>/tests against the current flags. See runFixtures in ../lib.ts for the format.
 */
import { report, runFixtures } from "../lib.ts";

export async function check(_args: string[], root: string): Promise<void> {
  const run = await runFixtures(root);
  if (run.blocked.length > 0) {
    report(run.blocked);
    console.error("fix validation errors before running fixtures");
    process.exit(1);
  }
  if (run.files < 0) {
    console.log("no tests/ directory, nothing to check");
    return;
  }
  report(run.failures);
  if (run.failures.length > 0) {
    console.error(`\n${run.failures.length} of ${run.total} fixture(s) failed`);
    process.exit(1);
  }
  console.log(`${run.total} fixture(s) passed across ${run.files} file(s)`);
}
