import {
  isSegmentCondition,
  type AttributeCondition,
  type Bundle,
  type Condition,
  type Context,
  type Evaluation,
  type Flag,
  type Rule,
  type Scalar,
  type Segments,
} from "./types.ts";
import { bucket } from "./hash.ts";
import { compareSemver, parseSemver } from "./semver.ts";

function isScalar(v: unknown): v is Scalar {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** Loose equality that treats "42" and 42 as equal, since context often arrives as strings. */
function scalarEquals(a: Scalar, b: Scalar): boolean {
  if (typeof a === typeof b) return a === b;
  return String(a) === String(b);
}

function compareNumeric(a: Scalar, b: Scalar, cmp: (x: number, y: number) => boolean): boolean {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  return cmp(x, y);
}

function compareVersions(a: Scalar, b: Scalar, cmp: (c: number) => boolean): boolean {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return false;
  return cmp(compareSemver(x, y));
}

export function matchAttributeCondition(condition: AttributeCondition, context: Context): boolean {
  const actual = context[condition.attribute];
  const present = actual !== undefined && actual !== null;

  if (condition.operator === "exists") {
    return present;
  }
  if (!present || !isScalar(actual)) return false;

  const expected = condition.value;

  switch (condition.operator) {
    case "eq":
      return isScalar(expected) && scalarEquals(actual, expected);
    case "neq":
      return isScalar(expected) && !scalarEquals(actual, expected);
    case "in":
      return Array.isArray(expected) && expected.some((v) => scalarEquals(actual, v));
    case "not_in":
      return Array.isArray(expected) && !expected.some((v) => scalarEquals(actual, v));
    case "contains":
      return isScalar(expected) && String(actual).includes(String(expected));
    case "starts_with":
      return isScalar(expected) && String(actual).startsWith(String(expected));
    case "ends_with":
      return isScalar(expected) && String(actual).endsWith(String(expected));
    case "gt":
      return isScalar(expected) && compareNumeric(actual, expected, (x, y) => x > y);
    case "gte":
      return isScalar(expected) && compareNumeric(actual, expected, (x, y) => x >= y);
    case "lt":
      return isScalar(expected) && compareNumeric(actual, expected, (x, y) => x < y);
    case "lte":
      return isScalar(expected) && compareNumeric(actual, expected, (x, y) => x <= y);
    case "semver_eq":
      return isScalar(expected) && compareVersions(actual, expected, (c) => c === 0);
    case "semver_gt":
      return isScalar(expected) && compareVersions(actual, expected, (c) => c > 0);
    case "semver_gte":
      return isScalar(expected) && compareVersions(actual, expected, (c) => c >= 0);
    case "semver_lt":
      return isScalar(expected) && compareVersions(actual, expected, (c) => c < 0);
    case "semver_lte":
      return isScalar(expected) && compareVersions(actual, expected, (c) => c <= 0);
    default:
      return false;
  }
}

/** A segment condition matches when every condition in the segment matches. An unknown segment never matches. */
export function matchCondition(condition: Condition, context: Context, segments: Segments = {}): boolean {
  if (isSegmentCondition(condition)) {
    const segment = segments[condition.segment];
    if (!segment) return false;
    return segment.conditions.every((c) => matchAttributeCondition(c, context));
  }
  return matchAttributeCondition(condition, context);
}

/**
 * A rule matches when every condition matches AND the context falls inside
 * the rollout percentage. A partial rollout with no bucketing attribute in
 * the context never matches, so unknown users never get a random variant.
 */
export function matchRule(flagKey: string, rule: Rule, context: Context, segments: Segments = {}): boolean {
  for (const condition of rule.conditions) {
    if (!matchCondition(condition, context, segments)) return false;
  }
  const rollout = rule.rollout ?? 100;
  if (rollout >= 100) return true;
  if (rollout <= 0) return false;

  const bucketValue = context[rule.bucket_by ?? "user_id"];
  if (bucketValue === undefined || bucketValue === null) return false;
  return bucket(flagKey, String(bucketValue)) < rollout;
}

export function evaluate(flag: Flag, context: Context = {}, segments: Segments = {}): Evaluation {
  if (!flag.enabled) {
    return { key: flag.key, value: flag.default, reason: "FLAG_DISABLED" };
  }
  for (const rule of flag.rules ?? []) {
    if (matchRule(flag.key, rule, context, segments)) {
      return { key: flag.key, value: rule.value, reason: "RULE_MATCH", rule: rule.name };
    }
  }
  return { key: flag.key, value: flag.default, reason: "DEFAULT" };
}

export function evaluateAll(bundle: Bundle, context: Context = {}): Record<string, Evaluation> {
  const out: Record<string, Evaluation> = {};
  for (const key of Object.keys(bundle.flags)) {
    out[key] = evaluate(bundle.flags[key], context, bundle.segments ?? {});
  }
  return out;
}
