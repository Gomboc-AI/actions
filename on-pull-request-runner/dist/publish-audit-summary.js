/**
 * Composite step (Phase 1): post a single markdown summary comment on the PR.
 */
import fs from 'node:fs';
import { artifactPath } from './lib/artifacts.js';
import { GitHubClient, parseOwnerRepo } from './lib/github-client.js';
import { loadPullRequestContext } from './lib/github-context.js';
import { runMain } from './lib/runner.js';
const MARKER = '<!-- gomboc-orl-audit -->';
async function main() {
    const github = GitHubClient.fromEnv();
    const pr = loadPullRequestContext();
    const { owner, repo } = parseOwnerRepo(pr.repository);
    const normalized = JSON.parse(fs.readFileSync(artifactPath('normalized-report.json'), 'utf8'));
    const body = `${MARKER}
## Gomboc ORL audit summary

| Metric | Count |
|--------|-------|
| Findings | ${normalized.findings ?? 0} |
| Fixes | ${normalized.fixes ?? 0} |
| Changes | ${normalized.changes ?? 0} |

Scan results are attached as workflow artifacts (\`gomboc-orl-report\`).
`;
    await github.postIssueComment({ owner, repo, issueNumber: pr.number, body });
    console.log('Posted audit summary comment on PR');
}
runMain(main);
//# sourceMappingURL=publish-audit-summary.js.map