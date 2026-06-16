/**
 * Pull request fields from `GITHUB_EVENT_PATH` and related env vars.
 */
import fs from 'node:fs';
/** Loads PR context from the webhook payload; throws if not a `pull_request` event. */
export function loadPullRequestContext() {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) {
        throw new Error('GITHUB_EVENT_PATH is not set');
    }
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
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
export function pullRequestUrlForNumber(repository, number) {
    const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
    return `${server}/${repository}/pull/${number}`;
}
/** Canonical pull request URL for GitHub.com or GHES. */
export function pullRequestUrl(pr) {
    return pullRequestUrlForNumber(pr.repository, pr.number);
}
/** Builds Integrations `scmContext` for a GitHub pull request scan. */
export function buildGitHubScmContext(originalPullRequest, resultingPullRequest) {
    const scmContext = {
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
export function parseScmPullRequestRef(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const ref = value;
    if (typeof ref.id !== 'string' || !ref.id.trim())
        return undefined;
    if (typeof ref.url !== 'string' || !ref.url.trim())
        return undefined;
    if (typeof ref.author !== 'string' || !ref.author.trim())
        return undefined;
    return { id: ref.id, url: ref.url, author: ref.author };
}
//# sourceMappingURL=github-context.js.map