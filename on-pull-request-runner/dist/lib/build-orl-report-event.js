import { buildGitHubScmContext, } from './github-context.js';
/** Builds a typed Integrations ORL report event for GitHub Actions PR scans. */
export function buildCreateOrlReportEventBody(args) {
    const github = {
        repository: args.github.repository,
        prNumber: args.github.number,
        headSha: args.github.headSha,
    };
    const orlReport = {
        ...args.orlReport,
        github,
    };
    return {
        version: 1.0,
        requestOrigin: 'GITHUB_ACTION',
        effect: 'SubmitForReview',
        reports: [
            {
                path: args.path,
                branch: args.branch,
                orlReport,
            },
        ],
        errors: [],
        durationInSeconds: args.durationInSeconds,
        scmContext: buildGitHubScmContext(args.github, args.resultingPullRequest),
    };
}
//# sourceMappingURL=build-orl-report-event.js.map