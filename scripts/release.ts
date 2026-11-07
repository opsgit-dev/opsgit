/**
 * Bumps every publishable package to the same version, commits, and tags.
 *   node scripts/release.ts 0.2.0
 * Pushing the tag runs .github/workflows/release.yml, which publishes to npm.
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
  console.error("usage: node scripts/release.ts <x.y.z>");
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, "..");
const packages = ["packages/core", "packages/sdk", "packages/cli", "packages/mcp"];
const names = new Set<string>();

for (const p of packages) names.add(JSON.parse(await readFile(path.join(root, p, "package.json"), "utf8")).name);
for (const p of packages) {
  const file = path.join(root, p, "package.json");
  const pkg = JSON.parse(await readFile(file, "utf8"));
  pkg.version = version;
  for (const field of ["dependencies", "peerDependencies"]) {
    for (const dep of Object.keys(pkg[field] ?? {})) if (names.has(dep)) pkg[field][dep] = `^${version}`;
  }
  await writeFile(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${pkg.name} -> ${version}`);
  // MCP registry manifest, if the package has one
  try {
    const sf = path.join(root, p, "server.json");
    const srv = JSON.parse(await readFile(sf, "utf8"));
    srv.version = version;
    for (const pk of srv.packages ?? []) pk.version = version;
    await writeFile(sf, JSON.stringify(srv, null, 2) + "\n");
  } catch {}
}

const git = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: "inherit" });
execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: root, stdio: "inherit" });
git("add", ...packages.map((p) => `${p}/package.json`), "package-lock.json");
git("commit", "-m", `Release v${version}`);
git("tag", "-a", `v${version}`, "-m", `v${version}`);
console.log(`\ntagged v${version}. Push with:\n  git push origin main --follow-tags`);
