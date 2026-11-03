/**
 * The PR job in one command: validate, run fixtures, then create or update the
 * preview comment. Needs GITHUB_TOKEN, GITHUB_REPOSITORY, and a PR number from
 * --pr or the GitHub event payload.
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { check } from "./check.ts";
import { MARKER, renderDiff } from "./diff.ts";
import { validate } from "./validate.ts";
import { fail } from "../lib.ts";

export async function preview(args: string[], root: string): Promise<void> {
  const { values } = parseArgs({ args, options: { base: { type: "string" }, pr: { type: "string" }, "dry-run": { type: "boolean", default: false } } });

  await validate([], root);
  await check([], root);

  const baseRef = values.base ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main");
  const body = await renderDiff(baseRef, root);
  if (values["dry-run"]) {
    console.log(body);
    return;
  }

  let pr = values.pr;
  if (!pr && process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    pr = event.pull_request?.number ? String(event.pull_request.number) : undefined;
  }
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!pr || !token || !repo) fail("preview needs a pull request number (--pr or GitHub event), GITHUB_TOKEN, and GITHUB_REPOSITORY; use --dry-run to print instead");

  const api = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(`https://api.github.com${url}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) fail(`GitHub API ${init.method ?? "GET"} ${url} failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<any>;
  };

  const comments: { id: number; body: string }[] = await api(`/repos/${repo}/issues/${pr}/comments?per_page=100`);
  const existing = comments.find((c) => c.body.includes(MARKER));
  if (existing) {
    await api(`/repos/${repo}/issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
    console.log(`updated preview comment ${existing.id} on #${pr}`);
  } else {
    await api(`/repos/${repo}/issues/${pr}/comments`, { method: "POST", body: JSON.stringify({ body }) });
    console.log(`posted preview comment on #${pr}`);
  }
}
