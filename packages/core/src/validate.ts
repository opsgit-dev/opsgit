import {
  LIST_OPERATORS,
  OPERATORS,
  SEMVER_OPERATORS,
  UNARY_OPERATORS,
  type Flag,
  type Operator,
  type Segment,
} from "./types.ts";
import { parseSemver } from "./semver.ts";

export const KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,99}$/;

const FLAG_FIELDS = new Set(["$schema", "key", "description", "enabled", "default", "rules", "tags", "owner", "expires", "client"]);
const RULE_FIELDS = new Set(["name", "conditions", "rollout", "bucket_by", "value"]);
const CONDITION_FIELDS = new Set(["attribute", "operator", "value"]);
const SEGMENT_FIELDS = new Set(["$schema", "key", "description", "conditions"]);

export interface ValidateOptions {
  /** When given, `key` must equal the file's basename without `.json`. */
  fileName?: string;
  /** Known segment keys. When given, segment conditions must reference one of them. */
  segments?: Iterable<string>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isScalar(v: unknown): boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function unknownFields(obj: Record<string, unknown>, allowed: Set<string>, where: string, errors: string[]) {
  for (const field of Object.keys(obj)) {
    if (!allowed.has(field)) errors.push(`${where}: unknown field "${field}"`);
  }
}

function validateKey(input: Record<string, unknown>, options: ValidateOptions, errors: string[]) {
  const key = input.key;
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    errors.push(`key: must match ${KEY_PATTERN} (lowercase letters, digits, "_", ".", "-"; max 100 chars)`);
  } else if (options.fileName !== undefined) {
    const expected = options.fileName.replace(/\.json$/, "");
    if (key !== expected) errors.push(`key: "${key}" does not match file name "${options.fileName}"`);
  }
}

/**
 * Returns a list of human readable problems. An empty list means the flag is valid.
 * Deliberately hand written rather than JSON Schema so that messages say what
 * to fix, and so that PR validation needs no dependencies.
 */
export function validateFlag(input: unknown, options: ValidateOptions = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(input)) return ["flag must be a JSON object"];

  unknownFields(input, FLAG_FIELDS, "flag", errors);
  validateKey(input, options, errors);

  if (typeof input.enabled !== "boolean") errors.push('enabled: must be true or false');
  if (!("default" in input)) errors.push('default: required (the value served when disabled or no rule matches)');
  if ("description" in input && typeof input.description !== "string") errors.push("description: must be a string");
  if ("owner" in input && typeof input.owner !== "string") errors.push("owner: must be a string");
  if ("tags" in input && !(Array.isArray(input.tags) && input.tags.every((t) => typeof t === "string"))) {
    errors.push("tags: must be an array of strings");
  }
  if ("client" in input && typeof input.client !== "boolean") errors.push("client: must be true or false");
  if ("expires" in input) {
    const e = input.expires;
    if (typeof e !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(e) || Number.isNaN(Date.parse(e))) {
      errors.push('expires: must be an ISO date such as "2026-12-31"');
    }
  }

  const segments = options.segments ? new Set(options.segments) : undefined;
  if ("rules" in input) {
    if (!Array.isArray(input.rules)) {
      errors.push("rules: must be an array");
    } else {
      const names = new Set<string>();
      input.rules.forEach((rule, i) => validateRule(rule, i, names, segments, errors));
    }
  }
  return errors;
}

/** Validates a segment file. Segment conditions may not reference other segments. */
export function validateSegment(input: unknown, options: ValidateOptions = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(input)) return ["segment must be a JSON object"];

  unknownFields(input, SEGMENT_FIELDS, "segment", errors);
  validateKey(input, options, errors);
  if ("description" in input && typeof input.description !== "string") errors.push("description: must be a string");

  if (!Array.isArray(input.conditions) || input.conditions.length === 0) {
    errors.push("conditions: must be a non-empty array");
    return errors;
  }
  input.conditions.forEach((c, j) => {
    if (isPlainObject(c) && "segment" in c) {
      errors.push(`conditions[${j}]: segments cannot reference other segments`);
      return;
    }
    validateCondition(c, `conditions[${j}]`, undefined, errors);
  });
  return errors;
}

function validateRule(rule: unknown, index: number, names: Set<string>, segments: Set<string> | undefined, errors: string[]) {
  const where = `rules[${index}]`;
  if (!isPlainObject(rule)) {
    errors.push(`${where}: must be an object`);
    return;
  }
  unknownFields(rule, RULE_FIELDS, where, errors);

  if (typeof rule.name !== "string" || rule.name.trim() === "") {
    errors.push(`${where}.name: required, non-empty string`);
  } else if (names.has(rule.name)) {
    errors.push(`${where}.name: duplicate rule name "${rule.name}"`);
  } else {
    names.add(rule.name);
  }

  if (!("value" in rule)) errors.push(`${where}.value: required`);

  if ("rollout" in rule) {
    const r = rule.rollout;
    if (typeof r !== "number" || !Number.isFinite(r) || r < 0 || r > 100) {
      errors.push(`${where}.rollout: must be a number between 0 and 100`);
    }
  }
  if ("bucket_by" in rule && (typeof rule.bucket_by !== "string" || rule.bucket_by === "")) {
    errors.push(`${where}.bucket_by: must be a non-empty string`);
  }

  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    errors.push(`${where}.conditions: must be a non-empty array (a rule with no conditions would match everyone; use "default" for that)`);
    return;
  }
  rule.conditions.forEach((c, j) => validateCondition(c, `${where}.conditions[${j}]`, segments, errors));
}

function validateCondition(condition: unknown, where: string, segments: Set<string> | undefined, errors: string[]) {
  if (!isPlainObject(condition)) {
    errors.push(`${where}: must be an object`);
    return;
  }

  if ("segment" in condition) {
    const extra = Object.keys(condition).filter((k) => k !== "segment");
    if (extra.length > 0) errors.push(`${where}: a segment condition takes only "segment", not ${extra.map((k) => `"${k}"`).join(", ")}`);
    if (typeof condition.segment !== "string" || condition.segment === "") {
      errors.push(`${where}.segment: must be a non-empty string`);
    } else if (segments && !segments.has(condition.segment)) {
      errors.push(`${where}.segment: unknown segment "${condition.segment}" (no segments/${condition.segment}.json)`);
    }
    return;
  }

  unknownFields(condition, CONDITION_FIELDS, where, errors);

  if (typeof condition.attribute !== "string" || condition.attribute === "") {
    errors.push(`${where}.attribute: required, non-empty string`);
  }
  const op = condition.operator;
  if (typeof op !== "string" || !(OPERATORS as readonly string[]).includes(op)) {
    errors.push(`${where}.operator: must be one of ${OPERATORS.join(", ")}`);
    return;
  }
  const operator = op as Operator;
  const value = condition.value;

  if (UNARY_OPERATORS.has(operator)) {
    if ("value" in condition) errors.push(`${where}.value: "${operator}" takes no value`);
  } else if (LIST_OPERATORS.has(operator)) {
    if (!Array.isArray(value) || value.length === 0 || !value.every(isScalar)) {
      errors.push(`${where}.value: "${operator}" needs a non-empty array of strings, numbers or booleans`);
    }
  } else if (SEMVER_OPERATORS.has(operator)) {
    if (!parseSemver(value)) errors.push(`${where}.value: "${operator}" needs a version string such as "2.3.0"`);
  } else if (!isScalar(value)) {
    errors.push(`${where}.value: "${operator}" needs a string, number or boolean`);
  }
}

export function isFlag(input: unknown): input is Flag {
  return validateFlag(input).length === 0;
}

export function isSegment(input: unknown): input is Segment {
  return validateSegment(input).length === 0;
}
