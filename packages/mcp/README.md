# @opsgit/mcp

An MCP server for [opsgit flags](https://github.com/opsgit-dev/opsgit). It lets an AI agent work in your flags repository the way you would: list flags, create one, add rules, check that a rule does what you meant, run the fixtures, and see the pull request preview before opening it.

It runs over stdio and needs no account or key. Everything happens in the repository on disk.

## Set up

From inside a flags repository (one created with `npx opsgit-flags init`):

```sh
# Claude Code
claude mcp add opsgit -- npx -y @opsgit/mcp

# Codex CLI
codex mcp add opsgit -- npx -y @opsgit/mcp
```

For Cursor, Windsurf, or anything that reads a JSON config:

```json
{
  "mcpServers": {
    "opsgit": { "command": "npx", "args": ["-y", "@opsgit/mcp"] }
  }
}
```

The server finds the repository by looking for a `flags/` folder in the current directory or its parents. Set `OPSGIT_ROOT` or pass `--root <path>` to point it somewhere else.

## Tools

| Tool | What it does |
| --- | --- |
| `list_flags` | Every flag with its state, rule count, owner and expiry, plus known segments and any validation problems. |
| `get_flag` | The full definition of one flag. |
| `create_flag` | Writes `flags/<key>.json`, disabled with no rules. Same result as `opsgit-flags create`. |
| `update_flag` | Replaces a flag's definition. Validates first and refuses to write anything invalid. |
| `validate_flags` | Validates every flag and segment file. |
| `explain_flag` | Evaluates a flag for a context and shows which rule matched, which conditions passed, and the rollout bucket. |
| `check_fixtures` | Runs the fixtures in `tests/`, the same check the pull request runs. |
| `preview_diff` | The plain-English preview of what changed against `origin/main`, the same text the action posts on the PR. |

The server never touches git. Committing, branching and opening the pull request stay with the agent's own tools, which is where review belongs.

## A typical exchange

> Add a flag `new_pricing_page`, default off, owned by `@growth`, expiring at the end of Q1. Turn it on for the `beta_testers` segment at 25%, make sure a user `u1` sees it, then open a PR.

The agent calls `create_flag`, then `update_flag` with the rule, then `explain_flag` with `{"user_id":"u1"}`, then `validate_flags` and `check_fixtures`, then `preview_diff` to write the PR description, and finally its own git tools to branch, commit and push.

## Listing in the MCP Registry

`server.json` is the manifest for the [official MCP Registry](https://registry.modelcontextprotocol.io), which is where VS Code, Cursor and others fetch the logo, description and README shown on their install pages. After `@opsgit/mcp` is on npm:

```sh
brew install mcp-publisher          # or download a release from github.com/modelcontextprotocol/registry
cd packages/mcp
mcp-publisher login github          # the io.github.opsgit-dev namespace needs a GitHub login with access to the org
mcp-publisher publish
```

The registry checks that the npm package's `package.json` carries `"mcpName": "io.github.opsgit-dev/opsgit"`, which it does.

## Programmatic use

The tool functions are exported without the transport, if you want them in a script:

```ts
import { listFlags, explainFlag } from "@opsgit/mcp";
const { flags } = await listFlags("/path/to/repo");
```

MIT.
