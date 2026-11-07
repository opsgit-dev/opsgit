#!/usr/bin/env node
/**
 * opsgit MCP server over stdio. Run it from a flags repository (or set OPSGIT_ROOT / pass --root) and point your agent at it:
 *   claude mcp add opsgit -- npx -y @opsgit/mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkFixtures, createFlag, explainFlag, getFlag, listFlags, previewDiff, resolveRoot, updateFlag } from "./tools.ts";

const rootArg = process.argv.indexOf("--root");
const ROOT = resolveRoot(rootArg >= 0 ? process.argv[rootArg + 1] : undefined);

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const context = z.record(scalar).describe('Attributes to evaluate against, e.g. {"user_id":"u1","country":"US","app_version":"2.3.0"}');

const server = new McpServer({ name: "opsgit", version: "0.1.2" });
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const guard = async <T>(fn: () => Promise<T>) => {
  try {
    return text(await fn());
  } catch (err) {
    return { isError: true, ...text(`error: ${(err as Error).message}`) };
  }
};

server.registerTool("list_flags", {
  title: "List flags",
  description: `Lists every feature flag and segment in the repository at ${ROOT}, with validation problems if any. Call this first.`,
  inputSchema: {},
}, () => guard(() => listFlags(ROOT)));

server.registerTool("get_flag", {
  title: "Get a flag",
  description: "Returns the full definition of one flag: enabled, default, rules, owner, expiry, client visibility.",
  inputSchema: { key: z.string().describe("The flag key, e.g. new_checkout_v2") },
}, ({ key }) => guard(() => getFlag(ROOT, key)));

server.registerTool("create_flag", {
  title: "Create a flag",
  description: "Creates flags/<key>.json, disabled with no rules. Add rules with update_flag, then validate and open a pull request; merging deploys it.",
  inputSchema: {
    key: z.string().describe('Lowercase letters, digits, "_", ".", "-"'),
    default: z.unknown().optional().describe("Value when no rule matches or the flag is disabled (default false)"),
    description: z.string().optional(),
    owner: z.string().optional().describe("Team or person, e.g. @payments"),
    expires: z.string().optional().describe("ISO date after which the flag is flagged as stale, e.g. 2027-03-01"),
    client: z.boolean().optional().describe("true if browsers and mobile apps may evaluate it with a client key"),
  },
}, (input) => guard(() => createFlag(ROOT, input)));

server.registerTool("update_flag", {
  title: "Update a flag",
  description: "Replaces flags/<key>.json with the given definition. Validates against the schema and the known segments first and refuses to write an invalid flag, returning the problems instead.",
  inputSchema: {
    key: z.string(),
    definition: z.record(z.unknown()).describe('The whole flag object, e.g. {"enabled":true,"default":false,"rules":[{"name":"beta","conditions":[{"segment":"beta_testers"}],"value":true,"rollout":25}]}'),
  },
}, ({ key, definition }) => guard(() => updateFlag(ROOT, key, definition)));

server.registerTool("validate_flags", {
  title: "Validate",
  description: "Validates every flag and segment file. Run after any edit and before opening a pull request.",
  inputSchema: {},
}, () => guard(async () => (await import("./tools.ts")).validateAll(ROOT)));

server.registerTool("explain_flag", {
  title: "Explain an evaluation",
  description: "Evaluates one flag for a context and shows which rule matched, which conditions passed, and the rollout bucket. Use it to confirm a rule does what you intend.",
  inputSchema: { key: z.string(), context },
}, ({ key, context: ctx }) => guard(() => explainFlag(ROOT, key, ctx)));

server.registerTool("check_fixtures", {
  title: "Run fixtures",
  description: "Runs the expectation fixtures in tests/ against the current flags, the same check the pull request runs.",
  inputSchema: {},
}, () => guard(() => checkFixtures(ROOT)));

server.registerTool("preview_diff", {
  title: "Preview the pull request",
  description: "Renders the plain-English preview of what changed versus a git ref (default origin/main), the same text the action posts on the pull request.",
  inputSchema: { base: z.string().optional().describe("Git ref to compare against; default origin/main") },
}, ({ base }) => guard(() => previewDiff(ROOT, base)));

await server.connect(new StdioServerTransport());
