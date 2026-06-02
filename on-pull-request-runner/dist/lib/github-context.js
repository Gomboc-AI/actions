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
    return {
        number: pr.number,
        baseSha: pr.base.sha,
        headSha: pr.head.sha,
        headRef: process.env.GITHUB_HEAD_REF ?? '',
        repository: process.env.GITHUB_REPOSITORY ?? '',
    };
}
//# sourceMappingURL=github-context.js.map