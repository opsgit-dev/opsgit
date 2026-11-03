import { errorsOf, loadAll, report } from "./lib.ts";

const { flags, segments, problems } = await loadAll();
report(problems);

const errors = errorsOf(problems);
if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) in ${new Set(errors.map((p) => p.file)).size} file(s)`);
  process.exit(1);
}
const segmentNote = Object.keys(segments).length ? `, ${Object.keys(segments).length} segment(s)` : "";
console.log(`${Object.keys(flags).length} flag(s) valid${segmentNote}: ${Object.keys(flags).join(", ")}`);
