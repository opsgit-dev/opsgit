/**
 * Prints a Markdown report of expired and soon-to-expire flags, for the
 * weekly stale-flags issue. Exit code 0 always; the workflow decides what to do.
 */
import { daysUntil, loadAll } from "./lib.ts";

const { flags } = await loadAll();
const expired: string[] = [];
const soon: string[] = [];

for (const flag of Object.values(flags)) {
  if (!flag.expires) continue;
  const days = daysUntil(flag.expires);
  const owner = flag.owner ? ` (owner: ${flag.owner})` : "";
  if (days < 0) expired.push(`- [ ] \`${flag.key}\` expired **${-days} day(s) ago** on ${flag.expires}${owner}`);
  else if (days <= 14) soon.push(`- [ ] \`${flag.key}\` expires in **${days} day(s)** on ${flag.expires}${owner}`);
}

if (expired.length === 0 && soon.length === 0) {
  process.exit(0); // print nothing at all; the workflow treats an empty file as "nothing stale"
}

const parts = ["<!-- opsgit-stale-flags -->", "## Stale feature flags", ""];
if (expired.length) parts.push("### Expired", "These flags are past their `expires` date. Remove the file, or extend the date if the rollout is still in progress.", "", ...expired, "");
if (soon.length) parts.push("### Expiring within 14 days", "", ...soon, "");
parts.push(`<sub>Updated ${new Date().toISOString().slice(0, 10)} by the stale-flags workflow.</sub>`);
console.log(parts.join("\n"));
