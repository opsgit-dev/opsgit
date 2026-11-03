import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bundle } from "../packages/core/src/index.ts";
import { loadFlags, report } from "./lib.ts";

/** JSON with object keys sorted at every level, so the hash only changes when content does. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

const { flags, problems } = await loadFlags();
report(problems);
if (problems.length > 0) {
  console.error("refusing to build a bundle from invalid flags");
  process.exit(1);
}

const bundle: Bundle = {
  version: 1,
  generated_at: new Date().toISOString(),
  etag: createHash("sha256").update(canonical(flags)).digest("hex").slice(0, 16),
  flags,
};

const out = path.resolve(import.meta.dirname, "..", "worker", "src", "flags.generated.json");
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(bundle, null, 2) + "\n");
console.log(`bundled ${Object.keys(flags).length} flag(s) -> ${path.relative(process.cwd(), out)} (etag ${bundle.etag})`);
