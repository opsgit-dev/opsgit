import { errorsOf, loadAll, report } from "../lib.ts";

export async function list(_args: string[], root: string): Promise<void> {
  const { flags, problems } = await loadAll(root);
  report(errorsOf(problems));
  const rows = Object.values(flags).map((f) => ({
    key: f.key,
    state: f.enabled ? "enabled" : "disabled",
    default: JSON.stringify(f.default),
    client: f.client ? "yes" : "",
    rules: String(f.rules?.length ?? 0),
    owner: f.owner ?? "",
    expires: f.expires ?? "",
  }));
  if (rows.length === 0) {
    console.log("no flags");
    return;
  }
  const cols = ["key", "state", "default", "client", "rules", "owner", "expires"] as const;
  const width = Object.fromEntries(cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => r[c].length))]));
  const line = (r: Record<string, string>) => cols.map((c) => r[c].padEnd(width[c])).join("  ").trimEnd();
  console.log(line(Object.fromEntries(cols.map((c) => [c, c.toUpperCase()]))));
  for (const r of rows) console.log(line(r));
}
