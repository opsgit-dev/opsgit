import {
  evaluate,
  evaluateAll,
  type Bundle,
  type Context,
  type Evaluation,
  type JsonValue,
} from "@opsgit/core";

export type { Bundle, Context, Evaluation, Flag, JsonValue, Reason } from "@opsgit/core";
export { evaluate, evaluateAll } from "@opsgit/core";

type Fetch = typeof globalThis.fetch;

export interface FlagsClientOptions {
  /** Base URL of your deployed worker, e.g. https://opsgit-flags.you.workers.dev */
  baseUrl: string;
  /** A server key. Never ship this to a browser; use RemoteFlagsClient there. */
  apiKey: string;
  /** How often to check for a new bundle. Default 30s, minimum 1s. 0 disables polling. */
  pollIntervalMs?: number;
  /** Called when a new bundle has been loaded. */
  onUpdate?: (bundle: Bundle) => void;
  /** Called when a refresh fails. The last good bundle keeps being served. */
  onError?: (error: Error) => void;
  fetch?: Fetch;
}

/**
 * Server-side client. Downloads the whole bundle once, evaluates every flag
 * in memory, and polls for changes with If-None-Match so unchanged bundles
 * cost one small 304 round-trip. Evaluation never touches the network.
 */
export class FlagsClient {
  #options: Required<Pick<FlagsClientOptions, "baseUrl" | "apiKey" | "pollIntervalMs">> & FlagsClientOptions;
  #bundle: Bundle | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #closed = false;

  private constructor(options: FlagsClientOptions) {
    const pollIntervalMs = options.pollIntervalMs ?? 30_000;
    this.#options = {
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ""),
      pollIntervalMs: pollIntervalMs === 0 ? 0 : Math.max(1_000, pollIntervalMs),
    };
  }

  /** Fetches the bundle and starts polling. Throws if the first fetch fails. */
  static async init(options: FlagsClientOptions): Promise<FlagsClient> {
    const client = new FlagsClient(options);
    await client.refresh();
    client.#schedule();
    return client;
  }

  /** Builds a client from a bundle you already have, e.g. in tests or when embedding the JSON. */
  static fromBundle(bundle: Bundle, options?: Partial<FlagsClientOptions>): FlagsClient {
    const client = new FlagsClient({ baseUrl: "", apiKey: "", pollIntervalMs: 0, ...options });
    client.#bundle = bundle;
    return client;
  }

  get etag(): string | null {
    return this.#bundle?.etag ?? null;
  }

  get bundle(): Bundle | null {
    return this.#bundle;
  }

  /** Full evaluation with reason, or undefined for an unknown flag. */
  evaluation(key: string, context: Context = {}): Evaluation | undefined {
    const flag = this.#bundle?.flags[key];
    return flag ? evaluate(flag, context) : undefined;
  }

  /** The flag's value, or `fallback` when the flag does not exist. */
  get<T extends JsonValue>(key: string, context: Context, fallback: T): T {
    const result = this.evaluation(key, context);
    return result ? (result.value as T) : fallback;
  }

  /** True only when the flag evaluates to boolean true. */
  isEnabled(key: string, context: Context = {}): boolean {
    return this.evaluation(key, context)?.value === true;
  }

  all(context: Context = {}): Record<string, Evaluation> {
    return this.#bundle ? evaluateAll(this.#bundle, context) : {};
  }

  /** Fetches the bundle now. Resolves true when a new bundle was loaded. */
  async refresh(): Promise<boolean> {
    const fetchImpl = this.#options.fetch ?? globalThis.fetch;
    const headers: Record<string, string> = { authorization: `Bearer ${this.#options.apiKey}` };
    if (this.#bundle) headers["if-none-match"] = `"${this.#bundle.etag}"`;

    const response = await fetchImpl(`${this.#options.baseUrl}/v1/flags`, { headers });
    if (response.status === 304) return false;
    if (!response.ok) throw new Error(`flags fetch failed: ${response.status} ${await response.text()}`);

    const bundle = (await response.json()) as Bundle;
    if (bundle.version !== 1 || typeof bundle.flags !== "object") throw new Error("flags fetch returned an unexpected payload");
    this.#bundle = bundle;
    this.#options.onUpdate?.(bundle);
    return true;
  }

  close(): void {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #schedule(): void {
    if (this.#closed || this.#options.pollIntervalMs === 0) return;
    this.#timer = setTimeout(async () => {
      try {
        await this.refresh();
      } catch (err) {
        this.#options.onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        this.#schedule();
      }
    }, this.#options.pollIntervalMs);
    (this.#timer as { unref?: () => void }).unref?.();
  }
}

export interface RemoteFlagsClientOptions {
  baseUrl: string;
  /** A client key. Safe to ship in a browser or mobile app: it can evaluate but never read rules. */
  apiKey: string;
  fetch?: Fetch;
}

/**
 * Thin client for browsers and mobile apps. Sends the context to the edge and
 * gets evaluated values back, so targeting rules never leave the server.
 */
export class RemoteFlagsClient {
  #baseUrl: string;
  #apiKey: string;
  #fetch: Fetch;

  constructor(options: RemoteFlagsClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async #post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`flags request failed: ${response.status} ${await response.text()}`);
    return (await response.json()) as T;
  }

  evaluate(key: string, context: Context = {}): Promise<Evaluation & { etag: string; evaluated_at: string }> {
    return this.#post("/v1/evaluate", { flag_key: key, context });
  }

  /** Evaluate every flag once per session and keep the result in memory. */
  evaluateAll(context: Context = {}): Promise<{ etag: string; evaluated_at: string; flags: Record<string, Evaluation> }> {
    return this.#post("/v1/evaluate-all", { context });
  }
}
