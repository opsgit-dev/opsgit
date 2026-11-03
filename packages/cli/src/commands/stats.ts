/**
 * Evaluation counts per flag from Workers Analytics Engine, and flags with no
 * traffic. Needs CLOUDFLARE_API_TOKEN (Account Analytics: Read) and CLOUDFLARE_ACCOUNT_ID.
 */
import { parseArgs } from "node:util";
import { fail, loadAll } from "../lib.ts";

export async function stats(args: string[], root: string): Promise<void> {
  const { values } = parseArgs({ args, options: { days: { type: "string", default: "30" }, dataset: { type: "string", default: "opsgit_flag_evaluations" } } });
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) fail("stats needs CLOUDFLARE_API_TOKEN (with Account Analytics: Read) and CLOUDFLARE_ACCOUNT_ID in the environment");
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1) fail("--days must be a positive integer");

  const sql = `SELECT blob1 AS flag, SUM(_sample_interval) AS evaluations, MAX(timestamp) AS last_seen
    FROM ${values.dataset} WHERE timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY flag ORDER BY evaluations DESC`;
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: sql,
  });
  if (!res.ok) fail(`Analytics Engine query failed: ${res.status} ${await res.text()}`);
  const { data } = (await res.json()) as { data: { flag: string; evaluations: number; last_seen: string }[] };

  const { flags } = await loadAll(root);
  const seen = new Map(data.map((d) => [d.flag, d]));
  const width = Math.max(4, ...Object.keys(flags).map((k) => k.length), ...data.map((d) => d.flag.length));
  console.log(`${"FLAG".padEnd(width)}  ${"EVALUATIONS".padStart(11)}  LAST SEEN`);
  for (const d of data) console.log(`${d.flag.padEnd(width)}  ${String(Math.round(d.evaluations)).padStart(11)}  ${d.last_seen}`);

  const unused = Object.keys(flags).filter((k) => !seen.has(k));
  if (unused.length) console.log(`\nno traffic in ${days} day(s): ${unused.join(", ")}`);
  const unknown = data.filter((d) => !flags[d.flag]).map((d) => d.flag);
  if (unknown.length) console.log(`evaluated but no longer defined: ${unknown.join(", ")}`);
}
