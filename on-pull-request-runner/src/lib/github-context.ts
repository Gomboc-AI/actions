/**
 * Pull request fields from `GITHUB_EVENT_PATH` and related env vars.
 */
import fs from 'node:fs';

import type { CreateOrlReportEventV2RequestBody } from '../types.js';

/** SCM metadata attached to Integrations ORL report events. */
export type IntegrationsScmContext = NonNullable<
  CreateOrlReportEventV2RequestBody['scmContext']
>;

/** Pull request reference inside Integrations V2 `scmContext`. */
export type ScmPullRequestRef = NonNullable<
  IntegrationsScmContext['resultingPullRequest']
>;

type GitHubRepoContext = {
  id: string;
  name: string;
  fullName: string;
  ownerId: string;
  ownerName: string;
};

type GitHubPullRequestState = 'EXPECTED' | 'MERGED' | 'CLOSED' | 'OPEN';

/** Subset of PR metadata needed for diff scope, comments, Integrations, and remediate. */
export type PullRequestContext = {
  number: number;
  baseSha: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  repository: string;
  repositoryId: string;
  repositoryName: string;
  ownerId: string;
  ownerName: string;
  headRepoFullName: string;
  isFork: boolean;
  title: string;
  htmlUrl: string;
  state: GitHubPullRequestState;
  /** GitHub login of the user who opened the pull request. */
  authorLogin: string;
};

function stringId(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function repoContext(
  repo: {
    id?: number;
    node_id?: string;
    name?: string;
    full_name?: string;
    owner?: { id?: number; node_id?: string; login?: string };
  } | undefined,
  fallbackFullName: string
): GitHubRepoContext {
  const fullName = repo?.full_name?.trim() || fallbackFullName;
  const [fallbackOwner = '', fallbackName = fullName] = fullName.split('/');
  const ownerName = repo?.owner?.login?.trim() || fallbackOwner;
  const name = repo?.name?.trim() || fallbackName;
  return {
    id: stringId(repo?.node_id ?? repo?.id, fullName),
    name,
    fullName,
    ownerId: stringId(repo?.owner?.node_id ?? repo?.owner?.id, ownerName),
    ownerName,
  };
}

function prState(state: string | undefined, merged: boolean | undefined): GitHubPullRequestState {
  if (merged) return 'MERGED';
  if (state === 'closed') return 'CLOSED';
  if (state === 'open') return 'OPEN';
  return 'EXPECTED';
}

/** Loads PR context from the webhook payload; throws if not a `pull_request` event. */
export function loadPullRequestContext(): PullRequestContext {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is not set');
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as {
    pull_request?: {
      number: number;
      title?: string;
      html_url?: string;
      state?: string;
      merged?: boolean;
      user?: { login?: string };
      base: {
        sha: string;
        ref: string;
        repo?: Parameters<typeof repoContext>[0];
      };
      head: {
        sha: string;
        ref: string;
        repo?: Parameters<typeof repoContext>[0];
      };
    };
    repository?: Parameters<typeof repoContext>[0];
  };
  const pr = event.pull_request;
  if (!pr) {
    throw new Error('pull_request payload missing from GitHub event');
  }

  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const baseRepo = repoContext(pr.base.repo ?? event.repository, repository);
  const headRepo = repoContext(pr.head.repo, repository);
  const headRef = process.env.GITHUB_HEAD_REF ?? pr.head.ref ?? '';
  const baseRef = process.env.GITHUB_BASE_REF ?? pr.base.ref ?? '';

  return {
    number: pr.number,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    headRef,
    baseRef,
    repository,
    repositoryId: baseRepo.id,
    repositoryName: baseRepo.name,
    ownerId: baseRepo.ownerId,
    ownerName: baseRepo.ownerName,
    headRepoFullName: headRepo.fullName,
    isFork: headRepo.fullName !== repository,
    title: pr.title?.trim() || `Pull request #${pr.number}`,
    htmlUrl: pr.html_url?.trim() || pullRequestUrlForNumber(repository, pr.number),
    state: prState(pr.state, pr.merged),
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
    scmRepositoryId: originalPullRequest.repositoryId,
    originalPullRequest: {
      pullRequest: {
        ...externalPullRequestFromContext(originalPullRequest),
        authoredByGomboc: false,
      },
      branchCommit: {
        sha: originalPullRequest.headSha,
        branchName: originalPullRequest.headRef,
      },
    },
  };
  if (resultingPullRequest) {
    scmContext.resultingPullRequest = resultingPullRequest;
  }
  return scmContext;
}

/** Converts runner PR context into Integrations V2 external PR shape. */
export function externalPullRequestFromContext(
  pr: PullRequestContext
): ScmPullRequestRef {
  return {
    repositoryId: pr.repositoryId,
    repositoryName: pr.repositoryName,
    ownerId: pr.ownerId,
    ownerName: pr.ownerName,
    number: String(pr.number),
    url: pr.htmlUrl || pullRequestUrl(pr),
    title: pr.title,
    sourceBranch: pr.headRef,
    targetBranch: pr.baseRef,
    status: pr.state,
    provider: 'GitHub',
  };
}

/** Parses a remediation PR artifact into Integrations SCM shape. */
export function parseScmPullRequestRef(
  value: unknown
): ScmPullRequestRef | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const ref = value as Record<string, unknown>;
  if (typeof ref.repositoryId !== 'string' || !ref.repositoryId.trim()) return undefined;
  if (typeof ref.repositoryName !== 'string' || !ref.repositoryName.trim()) return undefined;
  if (typeof ref.ownerId !== 'string' || !ref.ownerId.trim()) return undefined;
  if (typeof ref.ownerName !== 'string' || !ref.ownerName.trim()) return undefined;
  if (typeof ref.number !== 'string' || !ref.number.trim()) return undefined;
  if (typeof ref.url !== 'string' || !ref.url.trim()) return undefined;
  if (typeof ref.title !== 'string' || !ref.title.trim()) return undefined;
  if (typeof ref.sourceBranch !== 'string' || !ref.sourceBranch.trim()) return undefined;
  if (typeof ref.targetBranch !== 'string' || !ref.targetBranch.trim()) return undefined;
  if (
    ref.status !== 'EXPECTED' &&
    ref.status !== 'MERGED' &&
    ref.status !== 'CLOSED' &&
    ref.status !== 'OPEN'
  ) {
    return undefined;
  }
  if (ref.provider !== 'GitHub') return undefined;
  return ref as ScmPullRequestRef;
}
