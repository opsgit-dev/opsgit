# opsgit flags

Feature flags that live in your Git repo and run on your own Cloudflare account.

- **Git is the control plane.** A flag is a JSON file in `flags/`. Changing one is a pull request, with review, CI validation, a plain-English preview comment, and a permanent audit trail.
- **The edge is the data plane.** On merge, the flags are compiled into a Cloudflare Worker and deployed globally. No KV, no database, no cold reads. Evaluation is an in-memory lookup.
- **Your account, your bill.** Nothing runs on anyone else's infrastructure. The free Workers tier covers 100k requests per day; the paid tier is $5 per month.
- **Local evaluation for backends.** Server SDKs download the bundle once and evaluate in-process. Browsers and mobile apps use a thin client that never sees your targeting rules.

## Set up a flags repository in two minutes

```sh
mkdir my-flags && cd my-flags && git init
npx opsgit-flags init
```

That writes `flags/`, `segments/`, `tests/`, JSON schemas for editor autocomplete, an example flag, and one workflow file, `.github/workflows/flags.yml`:

```yaml
- uses: pysavantcodes/opsgit/action@v0
  with:
    command: preview        # on pull requests: validate, run fixtures, post the preview comment
- uses: pysavantcodes/opsgit/action@v0
  with:
    command: deploy         # on merge to main: build the bundle, deploy the Worker
    worker-name: my-flags
    cloudflare-api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Then, once:

1. Create a Cloudflare API token with the **Edit Cloudflare Workers** template and add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.
2. Set the keys your apps will present, from your machine:

   ```sh
   npx wrangler login
   npx wrangler secret put SERVER_KEYS --name my-flags    # comma separated; for backends
   npx wrangler secret put CLIENT_KEYS --name my-flags    # comma separated; for browsers and mobile
   ```

3. Commit and push. Every pull request gets a preview comment. Every merge to `main` deploys.

Your repository never contains engine code. Updates arrive by bumping the action version.

## How it works

```
  pull request ──▶ validate (schema, key/filename match, rule shapes, segment references)
       │           fixtures (expected outcomes in tests/)
       │           preview comment ("rule north-america rollout: 50% → 75% ⚠️")
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

## Flag files

One file per flag in `flags/<key>.json`. The `key` must equal the file name.

```json
{
  "$schema": "../schema/flag.schema.json",
  "key": "new_checkout_v2",
  "description": "Redesigned multi-step checkout flow",
  "owner": "payments-team",
  "expires": "2027-03-31",
  "enabled": true,
  "default": false,
  "rules": [
    {
      "name": "staging-everyone",
      "conditions": [{ "attribute": "environment", "operator": "eq", "value": "staging" }],
      "value": true
    },
    {
      "name": "beta-testers",
      "conditions": [{ "segment": "beta_testers" }],
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
| `expires` | ISO date. Never enforced at runtime; CI warns as it nears and a weekly issue lists flags past it. |
| `client` | `true` lets browsers and mobile apps (client keys) evaluate this flag. **Default `false`**: the flag's name and value never leave your servers. |

**Rollouts are deterministic.** A context is bucketed by `murmur3("<flag_key>:<bucket value>")`, so the same user always sees the same variant, and different flags bucket the same user independently. A partial rollout never matches a context that lacks the bucketing attribute, so anonymous traffic does not flip between variants.

**Operators:** `eq`, `neq`, `in`, `not_in`, `contains`, `starts_with`, `ends_with`, `gt`, `gte`, `lt`, `lte`, `semver_eq`, `semver_gt`, `semver_gte`, `semver_lt`, `semver_lte`, `exists`. Comparisons treat `42` and `"42"` as equal, because context often arrives as strings. A missing attribute never matches, including for `neq` and `not_in`. The `semver_*` operators follow semver precedence, so `2.3.0-beta.1` is below `2.3.0`.

### Segments

A segment is a reusable audience in `segments/<key>.json`, referenced from rules with `{ "segment": "beta_testers" }`.

```json
{
  "key": "beta_testers",
  "conditions": [
    { "attribute": "beta_opt_in", "operator": "eq", "value": true },
    { "attribute": "plan", "operator": "in", "value": ["pro", "enterprise"] }
  ]
}
```

Segment conditions are ANDed and cannot nest. Referencing a missing segment is a validation error. The preview comment lists which flags a segment change affects.

### Fixtures

Files in `tests/` pin what a flag must return for a context, so a rule edit that accidentally exposes something fails the PR:

```json
[
  {
    "name": "anonymous US traffic never enters the rollout",
    "flag": "new_checkout_v2",
    "context": { "environment": "production", "country": "US" },
    "expect": { "value": false, "reason": "DEFAULT" }
  }
]
```

`expect` may contain any of `value`, `reason`, and `rule`. Only the fields present are checked.

## Command line

```sh
npx opsgit-flags create new_banner --default false --owner growth --expires 2027-06-30
npx opsgit-flags create new_banner ... --pr          # also branch, commit, push, open the PR
npx opsgit-flags list
npx opsgit-flags explain new_checkout_v2 -c environment=production -c country=US -c user_id=usr_1
npx opsgit-flags validate
npx opsgit-flags check                               # run fixtures
npx opsgit-flags diff origin/main                    # the preview comment, printed
npx opsgit-flags stats --days 30                     # evaluations per flag, and flags with no traffic
```

`explain` prints every rule with a tick or cross per condition and, for partial rollouts, the user's bucket.

`stats` reads Workers Analytics Engine. Enable Analytics Engine once in the Cloudflare dashboard (Workers & Pages → Analytics Engine), set `analytics: true` on the deploy step, and give `stats` a `CLOUDFLARE_API_TOKEN` with *Account Analytics: Read* plus `CLOUDFLARE_ACCOUNT_ID`.

## API

Every route except `/health` requires `Authorization: Bearer <key>` or `X-API-Key: <key>`.

| Route | Key | Purpose |
| --- | --- | --- |
| `GET /health` | none | Flag count, bundle ETag, build time. |
| `GET /v1/flags` | server | Whole bundle with rules and segments. Supports `If-None-Match` and answers `304`. |
| `GET /v1/flags/:key` | server | One flag definition. |
| `POST /v1/evaluate` | client or server | `{ "flag_key": "...", "context": { ... } }` → `{ key, value, reason, rule?, etag, evaluated_at }` |
| `POST /v1/evaluate-all` | client or server | `{ "context": { ... } }` → every flag's `{ value, reason, rule? }` |

`reason` is one of `RULE_MATCH`, `DEFAULT`, `FLAG_DISABLED`. An unknown flag is a `404` with `reason: FLAG_NOT_FOUND`. Client keys are rate limited per key and caller IP (120 requests per minute by default) so a leaked key cannot drain your request quota. Cloudflare enforces the limit per data center and counts approximately, so a caller whose traffic is spread across several locations can exceed it; treat it as abuse protection, not a quota.

Context attributes must be strings, numbers, or booleans. When the caller omits them, `country`, `region`, `city`, `continent`, `timezone`, `asn`, and `colo` are filled in from Cloudflare's view of the request. For server-to-server calls that is your backend's location, not your user's, so pass them explicitly.

## SDK

```sh
npm install @opsgit/flags-sdk
```

**Backend** (Node, Bun, Deno, Workers). Pulls the bundle once, polls every 30s with ETags, evaluates in memory:

```ts
import { FlagsClient } from "@opsgit/flags-sdk";

const flags = await FlagsClient.init({
  baseUrl: "https://my-flags.you.workers.dev",
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

`@opsgit/core` is the pure evaluation library underneath, with no I/O. Use it directly to embed the bundle JSON in your own process.

## Security model

- **Two key types.** Server keys can read rules. Client keys can only evaluate, only see flags marked `client: true`, never see rule names, and are rate limited. Ship client keys to browsers freely: the worst case is someone evaluating your client-visible flags for made-up contexts.
- **Server-only by default.** A flag without `client: true` is invisible to client keys, and asking for it returns the same 404 as a flag that does not exist. Your unreleased feature names stay on the server.
- **Keys are Worker secrets**, compared by hash in constant time, never logged. Rotate by adding a new key to the list, deploying clients, then removing the old one.
- **Nothing is stored.** The Worker keeps no database and writes no request context anywhere. With analytics on, it records the flag key, reason, rule name and key role per evaluation, and nothing about the user.
- **Scope the Cloudflare token.** The "Edit Cloudflare Workers" template is the easy choice, but a custom token with only *Workers Scripts: Edit* and *Account Settings: Read* is enough to deploy and is what a leaked secret would be limited to.
- **Pinned supply chain.** Workflows and the action reference `actions/checkout` and `actions/setup-node` by commit hash, and the engine installs from a lockfile. Customers can pin `pysavantcodes/opsgit/action` to a commit hash too instead of the moving `v0` tag.
- **Who can change a flag** is whoever can merge to `main`. Use branch protection plus `.github/CODEOWNERS` to require review from flag owners.
- **A private repo is strongly recommended.** Flag names and descriptions reveal unreleased work.

## This repository

This is the engine, and it is also a working flags repository that dogfoods its own action.

```
flags/ segments/ tests/ schema/   this repo's own flags, exactly as a customer repo looks
action/                           composite GitHub Action customers reference
packages/core/                    @opsgit/core: evaluation + validation, zero dependencies   (MIT)
packages/sdk/                     @opsgit/flags-sdk                                          (MIT)
packages/cli/                     opsgit-flags: the CLI, with init templates                 (MIT)
worker/                           the Cloudflare Worker; flags.generated.json is built, not committed
.github/workflows/                validate.yml (PRs), deploy.yml (main), stale-flags.yml (weekly), release.yml (tags)
```

```sh
npm ci && npm run build
npm run test:all      # core, SDK, and Worker tests
npm run typecheck
npm run validate && npm run check
npm run deploy        # build + wrangler deploy from your machine
npm run release 0.2.0 # bump all packages, commit, tag; push the tag to publish
```

Releases publish the three packages to npm with provenance via trusted publishing, and move the `v0` tag that customer workflows reference.

## Roadmap

- Per-environment bundles so staging rules never ship to production
- React hook and server middleware packages
- Deploy to Cloudflare button once the template repo is public
