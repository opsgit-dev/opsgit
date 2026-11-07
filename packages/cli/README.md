# opsgit-flags

Command line for [opsgit flags](https://github.com/opsgit-dev/opsgit): feature flags as JSON files in your repo, reviewed in pull requests, deployed to a Cloudflare Worker on your own account.

No install needed:

```sh
npx opsgit-flags <command>
```

## Set up a repo

```sh
mkdir my-flags && cd my-flags && git init
npx opsgit-flags init
```

You get a `flags/` folder with an example flag, `segments/` and `tests/`, JSON schemas so your editor autocompletes the format, and one workflow at `.github/workflows/flags.yml`. The workflow validates every pull request and posts a comment describing what the change does in words, then deploys on merge to `main`.

Two one-off steps after that, which `init` also prints:

1. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets. The token needs the "Edit Cloudflare Workers" template.
2. Set the keys your apps will send, using wrangler: `npx wrangler secret put SERVER_KEYS --name opsgit-flags` and the same for `CLIENT_KEYS`.

Flags for `--worker-name` and `--action-ref` let you change the worker's name and pin the action version.

`init` also writes an `AGENTS.md` so that Claude Code, Codex, Cursor and similar agents know the layout, the rules, and the commands. If your agent supports MCP, `npx -y @opsgit/mcp` gives it the same operations as tools; see [@opsgit/mcp](https://www.npmjs.com/package/@opsgit/mcp).

## Day to day

```sh
npx opsgit-flags create dark_mode --default false --owner web --expires 2027-06-30
```

Writes `flags/dark_mode.json`, disabled, with no rules. Add `--client` if browsers or mobile apps need to read it; flags are server-only unless you say so. Add `--pr` and it also branches, commits, pushes and opens the pull request.

```sh
npx opsgit-flags list
```

```
KEY             STATE     DEFAULT  CLIENT  RULES  OWNER  EXPIRES
dark_mode       disabled  false            0      web    2027-06-30
new_checkout    enabled   false    yes     3      pay
```

```sh
npx opsgit-flags explain new_checkout -c country=US -c user_id=u_42 -c environment=production
```

```
new_checkout: enabled, default false
context: {"country":"US","user_id":"u_42","environment":"production"}

rule staging-everyone → true
  ✗ environment eq "staging"
rule north-america-50pct → true
  ✓ country in ["US","CA"]
  rollout 50%: bucket 16.40 → included

result: true  (RULE_MATCH: north-america-50pct)
```

This is the one to reach for when someone asks why they're seeing a feature.

```sh
npx opsgit-flags validate     # same checks CI runs
npx opsgit-flags check        # run the expectations in tests/
npx opsgit-flags diff main    # what changed since main, as Markdown
```

## In CI

The GitHub Action calls these for you, so you rarely need them directly:

```sh
npx opsgit-flags preview      # validate + check + post or update the PR comment
npx opsgit-flags build        # compile flags into a bundle JSON
npx opsgit-flags stale        # expired and soon-to-expire flags, as Markdown
```

`preview` reads the pull request number and token from the GitHub Actions environment. Pass `--dry-run` to print the comment instead of posting it.

## Usage stats

```sh
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx opsgit-flags stats --days 30
```

Shows evaluations per flag from Workers Analytics Engine and lists flags that had no traffic, which is how you find ones that can be deleted. Needs Analytics Engine enabled on your Cloudflare account and `analytics: true` on the deploy step. The token needs Account Analytics read access.

## Files

A flag:

```json
{
  "key": "new_checkout",
  "enabled": true,
  "default": false,
  "rules": [
    {
      "name": "canada-half",
      "conditions": [{ "attribute": "country", "operator": "eq", "value": "CA" }],
      "rollout": 50,
      "value": true
    }
  ]
}
```

A fixture in `tests/`:

```json
[
  {
    "name": "germans stay on the old checkout",
    "flag": "new_checkout",
    "context": { "country": "DE" },
    "expect": { "value": false }
  }
]
```

The full format, with segments and every operator, is in the [main README](https://github.com/opsgit-dev/opsgit#flag-files).

All commands take `--root <dir>` if you run them from outside the repo.

MIT.
