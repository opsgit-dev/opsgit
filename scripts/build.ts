import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bundle } from "../packages/core/src/index.ts";
import { canonical, errorsOf, loadAll, report, ROOT } from "./lib.ts";

const { flags, segments, problems } = await loadAll();
report(problems);
if (errorsOf(problems).length > 0) {
  console.error("refusing to build a bundle from invalid flags");
  process.exit(1);
}

const bundle: Bundle = {
  version: 1,
  generated_at: new Date().toISOString(),
  etag: createHash("sha256").update(canonical({ flags, segments })).digest("hex").slice(0, 16),
  flags,
  segments,
};

const out = path.join(ROOT, "worker", "src", "flags.generated.json");
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(bundle, null, 2) + "\n");
console.log(`bundled ${Object.keys(flags).length} flag(s), ${Object.keys(segments).length} segment(s) -> ${path.relative(process.cwd(), out)} (etag ${bundle.etag})`);
