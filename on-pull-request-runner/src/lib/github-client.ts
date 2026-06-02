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
