/**
 * Pull request fields from `GITHUB_EVENT_PATH` and related env vars.
 */
import fs from 'node:fs';

/** Subset of PR metadata needed for diff scope, comments, Integrations, and remediate. */
export type PullRequestContext = {
  number: number;
  baseSha: string;
  headSha: string;
  headRef: string;
  repository: string;
  headRepoFullName: string;
  isFork: boolean;
  /** GitHub login of the user who opened the pull request. */
  authorLogin: string;
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
      user?: { login?: string };
      base: { sha: string };
      head: { sha: string; ref: string; repo?: { full_name?: string } };
    };
  };
  const pr = event.pull_request;
  if (!pr) {
    throw new Error('pull_request payload missing from GitHub event');
  }

  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const headRepoFullName = pr.head.repo?.full_name ?? repository;

  return {
    number: pr.number,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    headRef: process.env.GITHUB_HEAD_REF ?? pr.head.ref ?? '',
    repository,
    headRepoFullName,
    isFork: headRepoFullName !== repository,
    authorLogin: pr.user?.login?.trim() ?? '',
  };
}
