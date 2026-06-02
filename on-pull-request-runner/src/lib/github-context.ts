/**
 * Pull request fields from `GITHUB_EVENT_PATH` and related env vars.
 */
import fs from 'node:fs';

/** Subset of PR metadata needed for diff scope, comments, and Integrations. */
export type PullRequestContext = {
  number: number;
  baseSha: string;
  headSha: string;
  headRef: string;
  repository: string;
};

/** Loads PR context from the webhook payload; throws if not a `pull_request` event. */
export function loadPullRequestContext(): PullRequestContext {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is not set');
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as {
    pull_request?: {
      number: number;
      base: { sha: string };
      head: { sha: string };
    };
  };
  const pr = event.pull_request;
  if (!pr) {
    throw new Error('pull_request payload missing from GitHub event');
  }
  return {
    number: pr.number,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    headRef: process.env.GITHUB_HEAD_REF ?? '',
    repository: process.env.GITHUB_REPOSITORY ?? '',
  };
}
