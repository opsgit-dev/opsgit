import bundleJson from "./flags.generated.json" with { type: "json" };
import { evaluate, evaluateAll, type Bundle, type Context, type Scalar } from "@opsgit/core";

/** Cloudflare rate limiting binding; see [[ratelimits]] in wrangler.toml. */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Workers Analytics Engine dataset binding. */
interface AnalyticsDataset {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

export interface Env {
  SERVER_KEYS?: string;
  CLIENT_KEYS?: string;
  ALLOWED_ORIGINS?: string;
  /** Optional. Limits client-key traffic per IP so a leaked key cannot drain the request quota. */
  RATE_LIMITER?: RateLimiter;
  /** Optional. Records one data point per flag evaluation for `opsgit-flags stats`. */
  EVALUATIONS?: AnalyticsDataset;
}

/** Analytics Engine accepts a bounded number of points per invocation; evaluate-all stays under it. */
const MAX_POINTS_PER_REQUEST = 20;

type Role = "server" | "client";

const BUNDLE = bundleJson as Bundle;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CONTEXT_ATTRIBUTES = 100;
const MAX_ATTRIBUTE_LENGTH = 1024;

/** Request geo fields filled in from Cloudflare when the caller did not supply them. */
const CF_FALLBACKS = ["country", "region", "city", "continent", "timezone", "asn", "colo"] as const;

// ---------- auth ----------

function splitKeys(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

async function sha256(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

function hex(bytes: Uint8Array, length: number): string {
  return Array.from(bytes.slice(0, length), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares hashes so that timing does not leak key length or prefix. */
async function keyMatches(presented: string, configured: string[]): Promise<boolean> {
  const a = await sha256(presented);
  let matched = false;
  for (const candidate of configured) {
    const b = await sha256(candidate);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    if (diff === 0) matched = true;
  }
  return matched;
}

function presentedKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  return request.headers.get("x-api-key");
}

async function authenticate(request: Request, env: Env): Promise<Role | null> {
  const key = presentedKey(request);
  if (!key) return null;
  if (await keyMatches(key, splitKeys(env.SERVER_KEYS))) return "server";
  if (await keyMatches(key, splitKeys(env.CLIENT_KEYS))) return "client";
  return null;
}

// ---------- responses ----------

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "*").trim();
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-api-key, if-none-match",
    "access-control-expose-headers": "etag",
    "access-control-max-age": "86400",
  };
  if (allowed === "*") {
    headers["access-control-allow-origin"] = "*";
  } else if (origin && splitKeys(allowed).includes(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "origin";
  }
  return headers;
}

function json(request: Request, env: Env, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-cache",
      ...corsHeaders(request, env),
      ...extra,
    },
  });
}

function error(request: Request, env: Env, status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json(request, env, { error: message, ...extra }, status);
}

// ---------- request parsing ----------

function isScalar(v: unknown): v is Scalar {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** Keeps only scalar attributes, caps size, and fills geo fields from Cloudflare when absent. */
function buildContext(raw: unknown, request: Request): Context {
  const context: Context = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    let count = 0;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (count >= MAX_CONTEXT_ATTRIBUTES) break;
      if (value === null) {
        context[key] = null;
      } else if (isScalar(value)) {
        context[key] = typeof value === "string" ? value.slice(0, MAX_ATTRIBUTE_LENGTH) : value;
      } else {
        continue;
      }
      count++;
    }
  }
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf;
  if (cf) {
    for (const field of CF_FALLBACKS) {
      if (context[field] === undefined && isScalar(cf[field])) context[field] = cf[field] as Scalar;
    }
  }
  return context;
}

async function readJsonBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; message: string }> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return { ok: false, message: `body exceeds ${MAX_BODY_BYTES} bytes` };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, message: `body exceeds ${MAX_BODY_BYTES} bytes` };
  if (text.trim() === "") return { ok: true, body: {} };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, message: "body must be a JSON object" };
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, message: "body is not valid JSON" };
  }
}

function etagMatches(request: Request): boolean {
  const header = request.headers.get("if-none-match");
  if (!header) return false;
  return header
    .split(",")
    .map((t) => t.trim().replace(/^W\//, "").replace(/^"|"$/g, ""))
    .some((t) => t === BUNDLE.etag || t === "*");
}

function record(env: Env, role: Role, evaluations: { key: string; reason: string; rule?: string }[]): void {
  if (!env.EVALUATIONS) return;
  for (const e of evaluations.slice(0, MAX_POINTS_PER_REQUEST)) {
    env.EVALUATIONS.writeDataPoint({ blobs: [e.key, e.reason, e.rule ?? "", role], doubles: [1], indexes: [e.key] });
  }
}

/** Client keys are public by design, so limit them per key and caller IP. Server keys are trusted. */
async function rateLimited(request: Request, env: Env, role: Role): Promise<boolean> {
  if (role !== "client" || !env.RATE_LIMITER) return false;
  const key = presentedKey(request) ?? "";
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.RATE_LIMITER.limit({ key: `${hex(await sha256(key), 8)}:${ip}` });
  return !success;
}

// ---------- routes ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (path === "/health" || path === "/") {
      return json(request, env, {
        ok: true,
        flags: Object.keys(BUNDLE.flags).length,
        etag: BUNDLE.etag,
        generated_at: BUNDLE.generated_at,
      });
    }

    if (splitKeys(env.SERVER_KEYS).length === 0 && splitKeys(env.CLIENT_KEYS).length === 0) {
      return error(request, env, 503, "no API keys configured; set the SERVER_KEYS and/or CLIENT_KEYS secrets");
    }

    const role = await authenticate(request, env);
    if (!role) return error(request, env, 401, "missing or invalid API key");
    if (await rateLimited(request, env, role)) return error(request, env, 429, "rate limit exceeded for this key and IP");

    // GET /v1/flags -> whole bundle, for server SDKs that evaluate locally
    if (path === "/v1/flags" && request.method === "GET") {
      if (role !== "server") return error(request, env, 403, "the flag bundle requires a server key");
      if (etagMatches(request)) {
        return new Response(null, { status: 304, headers: { etag: `"${BUNDLE.etag}"`, ...corsHeaders(request, env) } });
      }
      return json(request, env, BUNDLE, 200, { etag: `"${BUNDLE.etag}"` });
    }

    // GET /v1/flags/:key -> one definition
    const single = path.match(/^\/v1\/flags\/([^/]+)$/);
    if (single && request.method === "GET") {
      if (role !== "server") return error(request, env, 403, "flag definitions require a server key");
      const flag = BUNDLE.flags[decodeURIComponent(single[1])];
      if (!flag) return error(request, env, 404, "flag not found", { reason: "FLAG_NOT_FOUND" });
      return json(request, env, flag, 200, { etag: `"${BUNDLE.etag}"` });
    }

    // POST /v1/evaluate -> one flag for one context
    if (path === "/v1/evaluate" && request.method === "POST") {
      const parsed = await readJsonBody(request);
      if (!parsed.ok) return error(request, env, 400, parsed.message);
      const key = parsed.body.flag_key ?? parsed.body.key;
      if (typeof key !== "string") return error(request, env, 400, 'missing "flag_key"');
      const flag = BUNDLE.flags[key];
      if (!flag) return error(request, env, 404, "flag not found", { key, reason: "FLAG_NOT_FOUND" });
      const result = evaluate(flag, buildContext(parsed.body.context, request), BUNDLE.segments ?? {});
      record(env, role, [result]);
      return json(request, env, { ...result, etag: BUNDLE.etag, evaluated_at: new Date().toISOString() });
    }

    // POST /v1/evaluate-all -> every flag for one context, for browsers and mobile
    if (path === "/v1/evaluate-all" && request.method === "POST") {
      const parsed = await readJsonBody(request);
      if (!parsed.ok) return error(request, env, 400, parsed.message);
      const flags = evaluateAll(BUNDLE, buildContext(parsed.body.context, request));
      record(env, role, Object.values(flags));
      return json(request, env, { etag: BUNDLE.etag, evaluated_at: new Date().toISOString(), flags });
    }

    return error(request, env, 404, "not found");
  },
} satisfies ExportedHandler<Env>;
