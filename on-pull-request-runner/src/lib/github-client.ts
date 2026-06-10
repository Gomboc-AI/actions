/**
 * Minimal GitHub REST API client for PR comments and future review APIs.
 */
import { requireEnv } from './env.js';

const API_VERSION = '2022-11-28';

/** Parsed `owner` and `repo` from `GITHUB_REPOSITORY`. */
export type OwnerRepo = { owner: string; repo: string };

/** Splits `owner/repo` from `GITHUB_REPOSITORY`. */
export function parseOwnerRepo(repository: string): OwnerRepo {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  }
  return { owner, repo };
}

export type PostIssueCommentArgs = {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
};

export type PullReviewComment = {
  id: number;
  body: string;
  path: string;
  line: number | null;
};

export type CreatePullReviewCommentArgs = {
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
  path: string;
  line: number;
  startLine?: number;
  body: string;
};

export type IssueComment = {
  id: number;
  body: string;
};

export type PullRequestSummary = {
  number: number;
  state: string;
  head: { ref: string };
  base: { ref: string };
};

export type CreatePullRequestArgs = {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body: string;
};

/** Authenticated client using `GITHUB_TOKEN` and optional `GITHUB_API_URL`. */
export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly apiBase: string = process.env.GITHUB_API_URL ?? 'https://api.github.com'
  ) {}

  /** Builds a client from `GITHUB_TOKEN`. */
  static fromEnv(): GitHubClient {
    return new GitHubClient(requireEnv('GITHUB_TOKEN'));
  }

  /**
   * Performs an authenticated GitHub API request; throws on non-2xx.
   * `path` may be absolute or relative to `apiBase`.
   */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: this.headers(
        body !== undefined ? { 'Content-Type': 'application/json' } : undefined
      ),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(this.url(path), init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API ${method} ${path} failed (${res.status}): ${text}`);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await res.json()) as T;
    }
    return (await res.text()) as T;
  }

  /** Creates an issue/PR comment on the given issue number (PRs use issue comments API). */
  async postIssueComment(args: PostIssueCommentArgs): Promise<void> {
    const { owner, repo, issueNumber, body } = args;
    await this.request(
      'POST',
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      { body }
    );
  }

  /** Lists issue comments on a PR (issue) thread. */
  async listIssueComments(args: {
    owner: string;
    repo: string;
    issueNumber: number;
  }): Promise<IssueComment[]> {
    const { owner, repo, issueNumber } = args;
    return this.request<IssueComment[]>(
      'GET',
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`
    );
  }

  /** Updates an existing issue comment body. */
  async updateIssueComment(args: {
    owner: string;
    repo: string;
    commentId: number;
    body: string;
  }): Promise<void> {
    const { owner, repo, commentId, body } = args;
    await this.request(
      'PATCH',
      `/repos/${owner}/${repo}/issues/comments/${commentId}`,
      { body }
    );
  }

  /** Lists inline review comments on a pull request. */
  async listPullReviewComments(args: {
    owner: string;
    repo: string;
    pullNumber: number;
  }): Promise<PullReviewComment[]> {
    const { owner, repo, pullNumber } = args;
    return this.request<PullReviewComment[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/comments?per_page=100`
    );
  }

  /** Creates an inline review comment on the PR diff. */
  async createPullReviewComment(
    args: CreatePullReviewCommentArgs
  ): Promise<{ id: number }> {
    const { owner, repo, pullNumber, commitId, path, line, startLine, body } =
      args;
    const payload: Record<string, unknown> = {
      body,
      commit_id: commitId,
      path,
      line,
      side: 'RIGHT',
    };
    if (startLine !== undefined && startLine !== line) {
      payload.start_line = startLine;
      payload.start_side = 'RIGHT';
    }
    return this.request<{ id: number }>(
      'POST',
      `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`,
      payload
    );
  }

  /** Deletes a pull request review comment by id. */
  async deletePullReviewComment(args: {
    owner: string;
    repo: string;
    commentId: number;
  }): Promise<void> {
    const { owner, repo, commentId } = args;
    await this.request(
      'DELETE',
      `/repos/${owner}/${repo}/pulls/comments/${commentId}`
    );
  }

  /** Lists open pull requests for dedupe checks (first page). */
  async listOpenPullRequests(args: {
    owner: string;
    repo: string;
  }): Promise<PullRequestSummary[]> {
    const { owner, repo } = args;
    return this.request<PullRequestSummary[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls?state=open&per_page=100`
    );
  }

  /** Opens a pull request stacked into the feature branch. */
  async createPullRequest(args: CreatePullRequestArgs): Promise<{ number: number; html_url: string }> {
    const { owner, repo, title, head, base, body } = args;
    return this.request<{ number: number; html_url: string }>(
      'POST',
      `/repos/${owner}/${repo}/pulls`,
      { title, head, base, body }
    );
  }

  /** Updates pull request title/body (used for remediation PR summary). */
  async updatePullRequest(args: {
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
    title?: string;
  }): Promise<void> {
    const { owner, repo, pullNumber, body, title } = args;
    const payload: Record<string, string> = { body };
    if (title) payload.title = title;
    await this.request(
      'PATCH',
      `/repos/${owner}/${repo}/pulls/${pullNumber}`,
      payload
    );
  }

  /** Assigns users to a pull request (issues API). */
  async assignIssueAssignees(args: {
    owner: string;
    repo: string;
    issueNumber: number;
    assignees: string[];
  }): Promise<void> {
    const { owner, repo, issueNumber, assignees } = args;
    if (!assignees.length) return;
    await this.request(
      'POST',
      `/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
      { assignees }
    );
  }

  private headers(extra?: HeadersInit): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      ...extra,
    };
  }

  private url(path: string): string {
    if (path.startsWith('http')) return path;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.apiBase}${normalized}`;
  }
}
