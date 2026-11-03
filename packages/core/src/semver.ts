export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

/**
 * Lenient semver parser: accepts "1", "1.2", "v1.2.3", "1.2.3-beta.1+build".
 * Returns null for anything that is not a version.
 */
export function parseSemver(input: unknown): ParsedSemver | null {
  if (typeof input === "number") input = String(input);
  if (typeof input !== "string") return null;
  const match = input.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Number(a) - Number(b);
  if (an) return -1; // numeric identifiers sort before alphanumeric
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Negative when a < b, zero when equal, positive when a > b. Follows semver 2.0 precedence. */
export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // A version with a prerelease has lower precedence than the same version without.
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    if (a.prerelease[i] === undefined) return -1;
    if (b.prerelease[i] === undefined) return 1;
    const c = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (c !== 0) return c;
  }
  return 0;
}
