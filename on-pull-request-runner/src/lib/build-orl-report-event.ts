/**
 * Builds Integrations `createOrlReportEvent` request bodies for GitHub Actions.
 */
import type { CreateOrlReportEventRequestBody } from '@gomboc-ai/gomboc-node-sdk';
import {
  buildGitHubScmContext,
  type PullRequestContext,
  type ScmPullRequestRef,
} from './github-context.js';
import type {
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
}): CreateOrlReportEventRequestBody {
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
