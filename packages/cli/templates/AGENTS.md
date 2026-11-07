# Working in this repository

This repository holds feature flags for [opsgit](https://github.com/opsgit-dev/opsgit). Flags are JSON files; a change is a pull request; merging to `main` deploys a Cloudflare Worker that serves them. There is no dashboard. Everything an agent needs is in the files and the commands below.

## Layout

- `flags/<key>.json`: one flag per file. The file name is the key.
- `segments/<name>.json`: named groups of attribute values, referenced from rules as `{ "segment": "<name>" }`.
- `tests/*.json`: fixtures. Each case pins the expected value for a flag and a context. They run on every pull request.
- `schema/`: JSON Schemas for flags and segments. Editors and validators use them.
- `.github/workflows/flags.yml`: validates and previews on pull requests, deploys on merge. Do not edit unless asked.

## Rules of the road

1. Never edit a flag on `main` directly. Branch, change, open a pull request.
2. Run `npx opsgit-flags validate` after any edit and `npx opsgit-flags check` before opening a PR. Both must pass.
3. A new flag starts disabled with no rules. Enable it and add rules in the same or a later PR, as the task requires.
4. Rules are evaluated top to bottom; the first rule whose conditions all match wins. A `rollout` under 100 needs a `bucket_by` attribute in the context (default `user_id`).
5. Flags are server-only unless `"client": true`. Only set that when browsers or mobile apps must evaluate the flag.
6. Set `owner` and `expires` on every new flag so stale flags can be found and removed.
7. Describe the change in the PR body the way the preview comment does: what changed, for whom, by how much.

## Commands

```sh
npx opsgit-flags create <key> --default false --owner @team --expires 2027-03-01   # new flag, disabled
npx opsgit-flags validate                                                          # schema and reference checks
npx opsgit-flags explain <key> -c user_id=u1 -c country=US                         # which rule matches and why
npx opsgit-flags check                                                             # run tests/ fixtures
npx opsgit-flags diff origin/main                                                  # the PR preview, locally
npx opsgit-flags stale                                                             # expired or untouched flags
```

## MCP

If your agent supports MCP, add the opsgit server and it gets these as tools instead of shell commands:

```sh
claude mcp add opsgit -- npx -y @opsgit/mcp
```
