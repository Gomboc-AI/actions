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
//# sourceMappingURL=github-context.js.map