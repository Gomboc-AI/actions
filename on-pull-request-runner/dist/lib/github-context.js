/**
 * Pull request fields from `GITHUB_EVENT_PATH` and related env vars.
 */
import fs from 'node:fs';
function stringId(value, fallback) {
    if (typeof value === 'string' && value.trim())
        return value;
    if (typeof value === 'number')
        return String(value);
    return fallback;
}
function repoContext(repo, fallbackFullName) {
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
function prState(state, merged) {
    if (merged)
        return 'MERGED';
    if (state === 'closed')
        return 'CLOSED';
    if (state === 'open')
        return 'OPEN';
    return 'EXPECTED';
}
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
export function externalPullRequestFromContext(pr) {
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
export function parseScmPullRequestRef(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const ref = value;
    if (typeof ref.repositoryId !== 'string' || !ref.repositoryId.trim())
        return undefined;
    if (typeof ref.repositoryName !== 'string' || !ref.repositoryName.trim())
        return undefined;
    if (typeof ref.ownerId !== 'string' || !ref.ownerId.trim())
        return undefined;
    if (typeof ref.ownerName !== 'string' || !ref.ownerName.trim())
        return undefined;
    if (typeof ref.number !== 'string' || !ref.number.trim())
        return undefined;
    if (typeof ref.url !== 'string' || !ref.url.trim())
        return undefined;
    if (typeof ref.title !== 'string' || !ref.title.trim())
        return undefined;
    if (typeof ref.sourceBranch !== 'string' || !ref.sourceBranch.trim())
        return undefined;
    if (typeof ref.targetBranch !== 'string' || !ref.targetBranch.trim())
        return undefined;
    if (ref.status !== 'EXPECTED' &&
        ref.status !== 'MERGED' &&
        ref.status !== 'CLOSED' &&
        ref.status !== 'OPEN') {
        return undefined;
    }
    if (ref.provider !== 'GitHub')
        return undefined;
    return ref;
}
//# sourceMappingURL=github-context.js.map