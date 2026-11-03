import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Bundle } from "@opsgit/core";
import { canonical, errorsOf, loadAll, report } from "../lib.ts";

export async function build(args: string[], root: string): Promise<void> {
  const { values } = parseArgs({ args, options: { out: { type: "string" } } });
  const { flags, segments, problems } = await loadAll(root);
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

  const out = values.out
    ? path.resolve(values.out)
    : existsSync(path.join(root, "worker"))
      ? path.join(root, "worker", "src", "flags.generated.json")
      : path.join(root, "flags.generated.json");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(bundle, null, 2) + "\n");
  console.log(`bundled ${Object.keys(flags).length} flag(s), ${Object.keys(segments).length} segment(s) -> ${path.relative(process.cwd(), out)} (etag ${bundle.etag})`);
}
