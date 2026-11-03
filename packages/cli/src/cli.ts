#!/usr/bin/env node
import { resolveRoot } from "./lib.ts";
import { build } from "./commands/build.ts";
import { check } from "./commands/check.ts";
import { create } from "./commands/create.ts";
import { diff } from "./commands/diff.ts";
import { explain } from "./commands/explain.ts";
import { init } from "./commands/init.ts";
import { list } from "./commands/list.ts";
import { preview } from "./commands/preview.ts";
import { stale } from "./commands/stale.ts";
import { stats } from "./commands/stats.ts";
import { validate } from "./commands/validate.ts";

const HELP = `opsgit-flags <command> [options]

  init                 Set up this repository: dirs, schemas, example flag, GitHub workflow
      --dir <path>  --worker-name <name>  --action-ref <owner/repo/action@ref>  --force
  create <key>         Create flags/<key>.json
      --default <json>  --description <text>  --owner <name>  --expires <date>  --pr
  list                 Show every flag with its state
  explain <key>        Show how a flag evaluates for a context
      -c attr=value (repeatable)  --context <json>
  validate             Check all flag and segment files
  check                Run the fixtures in tests/
  diff <base-ref>      Print a Markdown summary of flag changes since a git ref
  preview              validate + check + post/update the PR preview comment (CI)
      --base <ref>  --pr <number>  --dry-run
  build                Compile flags into a bundle JSON
      --out <file>
  stale                Print expired and expiring flags as Markdown (empty when none)
  stats                Evaluation counts per flag from Workers Analytics Engine
      --days <n>  --dataset <name>

Global: --root <dir>   flags repository root (default: nearest ancestor with flags/)
`;

const commands: Record<string, (args: string[], root: string) => Promise<void>> = {
  init, create, list, explain, validate, check, diff, preview, build, stale, stats,
};

const argv = process.argv.slice(2);
let rootArg: string | undefined;
const rootIndex = argv.indexOf("--root");
if (rootIndex !== -1) {
  rootArg = argv[rootIndex + 1];
  argv.splice(rootIndex, 2);
}
const [command, ...rest] = argv;

if (!command || command === "help" || command === "--help" || command === "-h") {
  console.log(HELP);
} else if (commands[command]) {
  await commands[command](rest, resolveRoot(rootArg));
} else {
  console.error(`unknown command "${command}"\n\n${HELP}`);
  process.exit(1);
}
