/**
 * Minimal GitHub REST API client for PR comments and future review APIs.
 */
import { requireEnv } from './env.js';
const API_VERSION = '2022-11-28';
/** Splits `owner/repo` from `GITHUB_REPOSITORY`. */
export function parseOwnerRepo(repository) {
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
        throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
    }
    return { owner, repo };
}
/** Authenticated client using `GITHUB_TOKEN` and optional `GITHUB_API_URL`. */
export class GitHubClient {
    token;
    apiBase;
    constructor(token, apiBase = process.env.GITHUB_API_URL ?? 'https://api.github.com') {
        this.token = token;
        this.apiBase = apiBase;
    }
    /** Builds a client from `GITHUB_TOKEN`. */
    static fromEnv() {
        return new GitHubClient(requireEnv('GITHUB_TOKEN'));
    }
    /**
     * Performs an authenticated GitHub API request; throws on non-2xx.
     * `path` may be absolute or relative to `apiBase`.
     */
    async request(method, path, body) {
        const init = {
            method,
            headers: this.headers(body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
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
            return undefined;
        }
        const contentType = res.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            return (await res.json());
        }
        return (await res.text());
    }
    /** Creates an issue/PR comment on the given issue number (PRs use issue comments API). */
    async postIssueComment(args) {
        const { owner, repo, issueNumber, body } = args;
        await this.request('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
    }
    /** Lists issue comments on a PR (issue) thread. */
    async listIssueComments(args) {
        const { owner, repo, issueNumber } = args;
        return this.request('GET', `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`);
    }
    /** Updates an existing issue comment body. */
    async updateIssueComment(args) {
        const { owner, repo, commentId, body } = args;
        await this.request('PATCH', `/repos/${owner}/${repo}/issues/comments/${commentId}`, { body });
    }
    /** Lists inline review comments on a pull request. */
    async listPullReviewComments(args) {
        const { owner, repo, pullNumber } = args;
        return this.request('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}/comments?per_page=100`);
    }
    /** Creates an inline review comment on the PR diff. */
    async createPullReviewComment(args) {
        const { owner, repo, pullNumber, commitId, path, line, startLine, body } = args;
        const payload = {
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
        return this.request('POST', `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, payload);
    }
    /** Deletes a pull request review comment by id. */
    async deletePullReviewComment(args) {
        const { owner, repo, commentId } = args;
        await this.request('DELETE', `/repos/${owner}/${repo}/pulls/comments/${commentId}`);
    }
    headers(extra) {
        return {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': API_VERSION,
            ...extra,
        };
    }
    url(path) {
        if (path.startsWith('http'))
            return path;
        const normalized = path.startsWith('/') ? path : `/${path}`;
        return `${this.apiBase}${normalized}`;
    }
}
//# sourceMappingURL=github-client.js.map