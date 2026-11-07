/**
 * Sets up a repository for opsgit flags: directories, JSON schemas, an example
 * flag and fixture, an AGENTS.md for AI coding agents, and the GitHub workflow that validates, previews, and deploys.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { TEMPLATES_DIR } from "../lib.ts";

export async function init(args: string[], _root: string): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      dir: { type: "string", default: "." },
      "worker-name": { type: "string", default: "opsgit-flags" },
      "action-ref": { type: "string", default: "opsgit-dev/opsgit/action@v0" },
      force: { type: "boolean", default: false },
    },
  });
  const root = path.resolve(values.dir!);
  const written: string[] = [];
  const skipped: string[] = [];

  async function put(rel: string, content: string) {
    const file = path.join(root, rel);
    if (existsSync(file) && !values.force) {
      skipped.push(rel);
      return;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    written.push(rel);
  }
  const template = async (name: string) => readFile(path.join(TEMPLATES_DIR, name), "utf8");

  await mkdir(path.join(root, "segments"), { recursive: true });
  await put("schema/flag.schema.json", await template("schema/flag.schema.json"));
  await put("schema/segment.schema.json", await template("schema/segment.schema.json"));
  await put("flags/example_banner.json", await template("example_banner.json"));
  await put("tests/example_banner.json", await template("example_banner.test.json"));
  await put("segments/.gitkeep", "");
  await put("AGENTS.md", await template("AGENTS.md"));
  await put(
    ".github/workflows/flags.yml",
    (await template("flags-workflow.yml")).replaceAll("__ACTION_REF__", values["action-ref"]!).replaceAll("__WORKER_NAME__", values["worker-name"]!),
  );

  for (const f of written) console.log(`  + ${f}`);
  for (const f of skipped) console.log(`  = ${f} (exists, left alone)`);
  console.log(`
next:
  1. Create a Cloudflare API token (template "Edit Cloudflare Workers") and add two repository secrets:
       CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
  2. Set the API keys your apps will use (one-time, from your machine):
       npx wrangler login
       npx wrangler secret put SERVER_KEYS --name ${values["worker-name"]}
       npx wrangler secret put CLIENT_KEYS --name ${values["worker-name"]}
  3. Commit and push. Every PR gets a preview comment; every merge to main deploys.
`);
}
