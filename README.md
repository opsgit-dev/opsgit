# opsgit flags

Feature flags that live in your Git repo and run on your own Cloudflare account.

- **Git is the control plane.** A flag is a JSON file in `flags/`. Changing one is a pull request, with CODEOWNERS review, CI validation, and a permanent audit trail.
- **The edge is the data plane.** On merge, the flags are compiled into a Cloudflare Worker and deployed globally. No KV, no database, no cold reads. Evaluation is an in-memory lookup.
- **Your account, your bill.** Nothing runs on anyone else's infrastructure. The free Workers tier covers 100k requests per day; the paid tier is $5 per month.
- **Local evaluation for backends.** Server SDKs download the bundle once and evaluate in-process, so a flag check costs no network round-trip. Browsers and mobile apps use a thin client that never sees your targeting rules.

## How it works

```
  pull request ──▶ validate-pr (schema, key/filename match, rule shapes)
       │
     merge to main
       │
       ▼
  GitHub Actions: build bundle ──▶ wrangler deploy ──▶ Cloudflare edge (global in seconds)
                                                             │
                     ┌───────────────────────────────────────┴───────────────────────┐
                     ▼                                                               ▼
        backend: GET /v1/flags (ETag, 304)                        browser/mobile: POST /v1/evaluate-all
        evaluates every flag in memory                            gets values only, never rules
```

Killing a flag is `git revert` plus the deploy time of the workflow, typically one to two minutes end to end.

## Quickstart

1. **Use this repo as a template** and clone it.
2. **Create a Cloudflare API token** with the *Edit Cloudflare Workers* template, and note your account ID.
3. **Add GitHub secrets** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and create a `production` environment (Settings → Environments). The deploy workflow uses it so you can require approvals later.
4. **Set the API keys the Worker will accept.** Generate long random strings and store them as Worker secrets:

   ```sh
   npm install
   npx wrangler login
   cd worker
   npx wrangler secret put SERVER_KEYS   # comma separated; for backends
   npx wrangler secret put CLIENT_KEYS   # comma separated; for browsers and mobile
   ```

5. **Push to `main`.** The deploy workflow builds the bundle and deploys the Worker. Check it:

   ```sh
   curl https://opsgit-flags.<your-subdomain>.workers.dev/health
   ```

6. **Edit a flag**, open a PR, watch validation run, merge. Done.

Prefer no GitHub secrets? Connect the repo in the Cloudflare dashboard under Workers → Create → Import a repository, set the root directory to `worker` and the build command to `cd .. && npm ci && npm run build`. Cloudflare then deploys on every push to `main` and you can delete `deploy.yml`.

### Local development

```sh
cp worker/.dev.vars.example worker/.dev.vars
npm run dev                      # builds, then wrangler dev on http://localhost:8787
curl -H "authorization: Bearer dev-server-key" http://localhost:8787/v1/flags
```

## Flag files

One file per flag in `flags/<key>.json`. The `key` must equal the file name. Add `"$schema": "../schema/flag.schema.json"` for editor autocomplete.

```json
{
  "key": "new_checkout_v2",
  "description": "Redesigned multi-step checkout flow",
  "owner": "payments-team",
  "enabled": true,
  "default": false,
  "rules": [
    {
      "name": "staging-everyone",
      "conditions": [{ "attribute": "environment", "operator": "eq", "value": "staging" }],
      "value": true
    },
    {
      "name": "north-america-50pct",
      "conditions": [{ "attribute": "country", "operator": "in", "value": ["US", "CA"] }],
      "rollout": 50,
      "value": true
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `enabled` | Master switch. When `false` the flag always serves `default`, whatever the rules say. |
| `default` | Any JSON value: boolean, number, string, or object. Served when disabled or when no rule matches. |
| `rules` | Evaluated in order. **First match wins.** |
| `rules[].conditions` | **All must match** (AND). Want OR? Write two rules with the same `value`. |
| `rules[].rollout` | Percent of matching contexts that receive `value`, 0 to 100. Default 100. |
| `rules[].bucket_by` | Context attribute used for bucketing. Default `user_id`. |
| `rules[].value` | Any JSON value, served when the rule matches. |

**Rollouts are deterministic.** A context is bucketed by `murmur3("<flag_key>:<bucket value>")`, so the same user always sees the same variant, and different flags bucket the same user independently. A partial rollout never matches a context that lacks the bucketing attribute, so anonymous traffic does not flip between variants.

**Operators:** `eq`, `neq`, `in`, `not_in`, `contains`, `starts_with`, `ends_with`, `gt`, `gte`, `lt`, `lte`, `exists`. Comparisons treat `42` and `"42"` as equal, because context often arrives as strings. A missing attribute never matches, including for `neq` and `not_in`.

Run `npm run validate` locally to see the same errors CI will report.

## API

Every route except `/health` requires `Authorization: Bearer <key>` or `X-API-Key: <key>`.

| Route | Key | Purpose |
| --- | --- | --- |
| `GET /health` | none | Flag count, bundle ETag, build time. |
| `GET /v1/flags` | server | Whole bundle with rules. Supports `If-None-Match` and answers `304`. |
| `GET /v1/flags/:key` | server | One flag definition. |
| `POST /v1/evaluate` | client or server | `{ "flag_key": "...", "context": { ... } }` → `{ key, value, reason, rule?, etag, evaluated_at }` |
| `POST /v1/evaluate-all` | client or server | `{ "context": { ... } }` → every flag's `{ value, reason, rule? }` |

`reason` is one of `RULE_MATCH`, `DEFAULT`, `FLAG_DISABLED`. An unknown flag is a `404` with `reason: FLAG_NOT_FOUND`.

Context attributes must be strings, numbers, or booleans. When the caller omits them, `country`, `region`, `city`, `continent`, `timezone`, `asn`, and `colo` are filled in from Cloudflare's view of the request. For server-to-server calls that is your backend's location, not your user's, so pass them explicitly.

## SDK

```sh
npm install @opsgit/flags-sdk
```

**Backend** (Node, Bun, Deno, Workers). Pulls the bundle once, polls every 30s with ETags, evaluates in memory:

```ts
import { FlagsClient } from "@opsgit/flags-sdk";

const flags = await FlagsClient.init({
  baseUrl: "https://opsgit-flags.you.workers.dev",
  apiKey: process.env.FLAGS_SERVER_KEY!,
});

if (flags.isEnabled("new_checkout_v2", { user_id: user.id, country: user.country, environment: "production" })) {
  // ...
}
const limit = flags.get("api_rate_limit", { plan: account.plan }, 100);
```

**Browser or mobile.** Sends context to the edge, receives values only:

```ts
import { RemoteFlagsClient } from "@opsgit/flags-sdk";

const flags = new RemoteFlagsClient({ baseUrl, apiKey: PUBLIC_CLIENT_KEY });
const { flags: values } = await flags.evaluateAll({ user_id, environment: "production" });
if (values.new_checkout_v2.value === true) { /* ... */ }
```

The SDK is a thin wrapper around `@opsgit/core`, which is a pure evaluation library with no I/O. Use it directly if you want to embed the bundle JSON in your own process.

## Security model

- **Two key types.** Server keys can read rules. Client keys can only evaluate. Ship client keys to browsers freely; the worst case is that someone evaluates flags for made-up contexts.
- **Keys are Worker secrets**, compared by hash in constant time. Rotate by adding a new key to the list, deploying clients, then removing the old one.
- **Who can change a flag** is whoever can merge to `main`. Use branch protection plus `.github/CODEOWNERS` to require review from flag owners.
- **A private repo is strongly recommended.** Flag names and descriptions reveal unreleased work.

## Limits worth knowing

- Workers free tier: 100k requests per day, 10ms CPU per request. Evaluation uses a fraction of a millisecond.
- Bundle size: Worker scripts can be up to 3MB on the free tier. Thousands of flags fit.
- Propagation: a merge is live globally within a few seconds of `wrangler deploy` finishing. Backend SDKs see it on their next poll.

## Repository layout

```
flags/              one JSON file per flag           ← the only directory most people touch
schema/             JSON Schema for editor support
packages/core/      evaluation + validation library, zero dependencies
packages/sdk/       @opsgit/flags-sdk
worker/             the Cloudflare Worker; flags.generated.json is built, not committed
scripts/            validate.ts (CI check) and build.ts (bundle)
.github/workflows/  validate.yml on PRs, deploy.yml on merge to main
```

```sh
npm run validate   # check flag files, no install needed
npm test           # core tests, no install needed
npm run build      # build core, sdk, and the flag bundle
npm run typecheck
npm run test:sdk
npm run deploy     # build + wrangler deploy from your machine
```

## Roadmap

- GitHub App that installs the workflows and `flags/` directory into an existing repo
- `semver_gt` / `semver_lt` operators for app version targeting
- Per-environment bundles so staging rules never ship to production
- Evaluation logging to Workers Analytics Engine
- Deploy to Cloudflare button once the template repo is public
