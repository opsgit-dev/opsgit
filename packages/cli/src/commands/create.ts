import { execFileSync } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { KEY_PATTERN } from "@opsgit/core";
import { errorsOf, fail, loadAll, report } from "../lib.ts";

export async function create(args: string[], root: string): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      default: { type: "string", default: "false" },
      description: { type: "string" },
      owner: { type: "string" },
      expires: { type: "string" },
      pr: { type: "boolean", default: false },
      client: { type: "boolean", default: false },
    },
  });
  const key = positionals[0];
  if (!key) fail("usage: opsgit-flags create <key> [--default <json>] [--description <text>] [--owner <name>] [--expires <date>] [--client] [--pr]");
  if (!KEY_PATTERN.test(key)) fail(`"${key}" is not a valid key: lowercase letters, digits, "_", ".", "-" only`);

  let defaultValue: unknown;
  try {
    defaultValue = JSON.parse(values.default!);
  } catch {
    fail(`--default must be JSON, e.g. --default false, --default 100, --default '"blue"'`);
  }

  const file = path.join(root, "flags", `${key}.json`);
  try {
    await access(file);
    fail(`flags/${key}.json already exists`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const flag: Record<string, unknown> = { $schema: "../schema/flag.schema.json", key };
  if (values.description) flag.description = values.description;
  if (values.owner) flag.owner = values.owner;
  if (values.expires) flag.expires = values.expires;
  if (values.client) flag.client = true;
  flag.enabled = false;
  flag.default = defaultValue;
  flag.rules = [];
  await writeFile(file, JSON.stringify(flag, null, 2) + "\n");

  const { problems } = await loadAll(root);
  const mine = errorsOf(problems).filter((p) => p.file === `flags/${key}.json`);
  if (mine.length) {
    report(mine);
    process.exit(1);
  }
  console.log(`created flags/${key}.json (disabled, default ${JSON.stringify(defaultValue)})`);

  if (!values.pr) {
    console.log(`\nnext:\n  edit flags/${key}.json to add rules\n  git checkout -b flags/${key} && git add flags/${key}.json && git commit -m "Add flag ${key}"\n  gh pr create --fill`);
    return;
  }
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: "inherit" });
  const branch = `flags/${key}`;
  git("checkout", "-b", branch);
  git("add", `flags/${key}.json`);
  git("commit", "-m", `Add flag ${key}${values.description ? `\n\n${values.description}` : ""}`);
  git("push", "-u", "origin", branch);
  execFileSync("gh", ["pr", "create", "--fill", "--title", `Add flag ${key}`], { cwd: root, stdio: "inherit" });
}
