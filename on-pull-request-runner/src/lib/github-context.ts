/**
 * Pull request fields from `GITHUB_EVENT_PATH` and related env vars.
 */
import fs from 'node:fs';

import type { CreateOrlReportEventRequestBody } from '@gomboc-ai/gomboc-node-sdk';

/** SCM metadata attached to Integrations ORL report events. */
export type IntegrationsScmContext = NonNullable<
  CreateOrlReportEventRequestBody['scmContext']
>;

/** One pull request reference inside Integrations `scmContext`. */
export type ScmPullRequestRef = NonNullable<
  IntegrationsScmContext['originalPullRequest']
>;

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

/** Canonical pull request URL for GitHub.com or GHES. */
export function pullRequestUrlForNumber(
  repository: string,
  number: number
): string {
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  return `${server}/${repository}/pull/${number}`;
}

/** Canonical pull request URL for GitHub.com or GHES. */
export function pullRequestUrl(pr: PullRequestContext): string {
  return pullRequestUrlForNumber(pr.repository, pr.number);
}

/** Builds Integrations `scmContext` for a GitHub pull request scan. */
export function buildGitHubScmContext(
  originalPullRequest: PullRequestContext,
  resultingPullRequest?: ScmPullRequestRef
): IntegrationsScmContext {
  const scmContext: IntegrationsScmContext = {
    scmType: 'GITHUB',
    originalPullRequest: {
      id: String(originalPullRequest.number),
      url: pullRequestUrl(originalPullRequest),
      author: originalPullRequest.authorLogin,
    },
  };
  if (resultingPullRequest) {
    scmContext.resultingPullRequest = resultingPullRequest;
  }
  return scmContext;
}

/** Parses a remediation PR artifact into Integrations SCM shape. */
export function parseScmPullRequestRef(
  value: unknown
): ScmPullRequestRef | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const ref = value as Record<string, unknown>;
  if (typeof ref.id !== 'string' || !ref.id.trim()) return undefined;
  if (typeof ref.url !== 'string' || !ref.url.trim()) return undefined;
  if (typeof ref.author !== 'string' || !ref.author.trim()) return undefined;
  return { id: ref.id, url: ref.url, author: ref.author };
}
