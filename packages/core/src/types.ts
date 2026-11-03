export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const OPERATORS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "contains",
  "starts_with",
  "ends_with",
  "gt",
  "gte",
  "lt",
  "lte",
  "semver_eq",
  "semver_gt",
  "semver_gte",
  "semver_lt",
  "semver_lte",
  "exists",
] as const;

export type Operator = (typeof OPERATORS)[number];

/** Operators whose `value` must be an array of scalars. */
export const LIST_OPERATORS: ReadonlySet<Operator> = new Set(["in", "not_in"]);
/** Operators that take no `value` at all. */
export const UNARY_OPERATORS: ReadonlySet<Operator> = new Set(["exists"]);
/** Operators whose `value` must be a semantic version string. */
export const SEMVER_OPERATORS: ReadonlySet<Operator> = new Set(["semver_eq", "semver_gt", "semver_gte", "semver_lt", "semver_lte"]);

export type Scalar = string | number | boolean;

export interface AttributeCondition {
  attribute: string;
  operator: Operator;
  /** Scalar for most operators, array of scalars for `in` / `not_in`, absent for `exists`. */
  value?: Scalar | Scalar[];
}

/** Matches when every condition of the named segment matches. */
export interface SegmentCondition {
  segment: string;
}

export type Condition = AttributeCondition | SegmentCondition;

export function isSegmentCondition(c: Condition): c is SegmentCondition {
  return typeof (c as SegmentCondition).segment === "string";
}

export interface Rule {
  /** Unique within the flag. Surfaces in evaluation reasons and logs. */
  name: string;
  /** All conditions must match (AND). Use several rules for OR. */
  conditions: Condition[];
  /** Percentage of matching contexts that receive `value`, 0-100. Default 100. */
  rollout?: number;
  /** Context attribute used for deterministic bucketing. Default "user_id". */
  bucket_by?: string;
  /** Value served when this rule matches. */
  value: JsonValue;
}

export interface Flag {
  key: string;
  description?: string;
  /** Master switch. When false the flag always serves `default`. */
  enabled: boolean;
  /** Value served when the flag is disabled or no rule matches. */
  default: JsonValue;
  /** Evaluated in order; first match wins. */
  rules?: Rule[];
  tags?: string[];
  owner?: string;
  /** ISO date after which the flag should be removed. Reported, never enforced. */
  expires?: string;
  /**
   * Whether browsers and mobile apps (client keys) may evaluate this flag.
   * Default false: the flag is invisible to client keys, so its name and value
   * never leave your servers.
   */
  client?: boolean;
}

/** A reusable, named audience. Conditions are ANDed, attribute conditions only. */
export interface Segment {
  key: string;
  description?: string;
  conditions: AttributeCondition[];
}

export type Segments = Record<string, Segment>;

export interface Bundle {
  version: 1;
  generated_at: string;
  /** Content hash of `flags` and `segments`. Doubles as the HTTP ETag. */
  etag: string;
  flags: Record<string, Flag>;
  segments?: Segments;
}

export type Context = Record<string, Scalar | null | undefined>;

export type Reason =
  | "FLAG_DISABLED"
  | "RULE_MATCH"
  | "DEFAULT"
  | "FLAG_NOT_FOUND";

export interface Evaluation {
  key: string;
  value: JsonValue;
  reason: Reason;
  /** Name of the matching rule, when reason is RULE_MATCH. */
  rule?: string;
}
