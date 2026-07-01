/**
 * Builds Integrations `createOrlReportEventV2` request bodies for GitHub Actions.
 */
import {
  buildGitHubScmContext,
  type PullRequestContext,
  type ScmPullRequestRef,
} from './github-context.js';
import type {
  CreateOrlReportEventV2RequestBody,
  IntegrationsOrlReport,
  IntegrationsOrlReportGitHub,
} from '../types.js';

/** Builds a typed Integrations ORL report event for GitHub Actions PR scans. */
export function buildCreateOrlReportEventBody(args: {
  orlReport: IntegrationsOrlReport;
  path: string;
  branch: string;
  github: PullRequestContext;
  durationInSeconds: number;
  resultingPullRequest?: ScmPullRequestRef;
  gitDiffs?: Record<string, string>;
  remediatedFileContent?: Record<string, string>;
  workflowStatus: { status: 'success' | 'failure'; errors: string[] };
  timing?: { startedAt?: string; completedAt?: string };
}): CreateOrlReportEventV2RequestBody {
  const github: IntegrationsOrlReportGitHub = {
    repository: args.github.repository,
    prNumber: args.github.number,
    headSha: args.github.headSha,
  };

  const orlReport: IntegrationsOrlReport = {
    ...args.orlReport,
    github,
  };

  return {
    version: 2.0,
    requestOrigin: 'GITHUB_ACTION',
    effect: 'SubmitForReview',
    reports: [
      {
        path: args.path,
        branch: args.branch,
        timestamp: args.timing?.completedAt,
        resultingPullRequest: args.resultingPullRequest,
        workflowStatus: args.workflowStatus,
        timing: args.timing,
        orlReport,
      },
    ],
    errors: [],
    durationInSeconds: args.durationInSeconds,
    gitDiffs: args.gitDiffs,
    remediatedFileContent: args.remediatedFileContent,
    workflowStatus: args.workflowStatus,
    timing: args.timing,
    scmContext: buildGitHubScmContext(args.github, args.resultingPullRequest),
  };
}
