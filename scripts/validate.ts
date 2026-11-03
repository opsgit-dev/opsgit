import { loadFlags, report } from "./lib.ts";

const { flags, problems } = await loadFlags();
report(problems);

const count = Object.keys(flags).length;
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) in ${count + new Set(problems.map((p) => p.file)).size} file(s)`);
  process.exit(1);
}
console.log(`${count} flag(s) valid: ${Object.keys(flags).join(", ")}`);
