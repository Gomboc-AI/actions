/**
 * Builds Integrations `createOrlReportEventV2` request bodies for GitHub Actions.
 */
import { normalizeOrlReport } from './normalize-orl-report.js';
import type {
  CreateOrlReportEventV2RequestBody,
  IntegrationsOrlFindingLocation,
  IntegrationsOrlReport,
  IntegrationsOrlReportRule,
  OrlFindingLocationRow,
  OrlLocation,
  OrlReport,
  OrlReportRule,
} from '../types.js';
import {
  buildGitHubScmContext,
  type PullRequestContext,
  type ScmPullRequestRef,
} from './github-context.js';
import { countRuleFindings } from './report-counts.js';

const RESOLUTION_STATUSES = new Set<NonNullable<IntegrationsOrlFindingLocation['resolutionStatus']>>([
  'unchanged',
  'shifted',
  'deleted',
  'invalidated',
]);

function locationForIntegrations(
  loc: OrlLocation,
  fallbackId: string
): NonNullable<IntegrationsOrlFindingLocation['originalLocation']> {
  return {
    id: loc.id?.trim() || fallbackId,
    filePath: loc.file_path,
    startLine: loc.start_line,
    ...(loc.end_line !== undefined ? { endLine: loc.end_line } : {}),
    startColumn: loc.start_column ?? 0,
    ...(loc.end_column !== undefined ? { endColumn: loc.end_column } : {}),
  };
}

function findingLocationForIntegrations(
  row: OrlFindingLocationRow
): IntegrationsOrlFindingLocation {
  const location: IntegrationsOrlFindingLocation = { id: row.id };
  if (row.original_location) {
    location.originalLocation = locationForIntegrations(row.original_location, row.id);
  }
  if (row.resolved_location) {
    location.resolvedLocation = locationForIntegrations(row.resolved_location, row.id);
  }
  if (
    row.resolution_status &&
    RESOLUTION_STATUSES.has(
      row.resolution_status as NonNullable<IntegrationsOrlFindingLocation['resolutionStatus']>
    )
  ) {
    location.resolutionStatus =
      row.resolution_status as NonNullable<IntegrationsOrlFindingLocation['resolutionStatus']>;
  }
  return location;
}

function ruleForIntegrations(rule: OrlReportRule): IntegrationsOrlReportRule {
  const metadata = rule.metadata;
  const findingLocations = (rule.finding_locations ?? []).map(findingLocationForIntegrations);

  return {
    name: rule.name,
    findings: countRuleFindings(rule),
    fixes: rule.fixes ?? 0,
    changes: rule.changes ?? 0,
    errors: rule.errors ?? [],
    files: rule.files ?? [],
    metadata: {
      name: metadata?.name?.trim() || rule.name,
      ...(metadata?.description ? { description: metadata.description } : {}),
      ...(metadata?.annotations ? { annotations: metadata.annotations } : {}),
      ...(metadata?.classifications?.length
        ? { classifications: metadata.classifications }
        : {}),
    },
    ...(findingLocations.length ? { findingLocations } : {}),
  };
}

/** Converts parsed `report.yaml` into the flat Integrations V2 ORL report shape. */
export function toIntegrationsOrlReport(report: OrlReport): IntegrationsOrlReport {
  const normalized = normalizeOrlReport(report);
  const rules = (report.spec.rules ?? []).map(ruleForIntegrations);

  return {
    type: 'Report',
    version: 'v1',
    metadata: normalized.metadata,
    workspace: normalized.workspace,
    language: normalized.language,
    rules_applied: normalized.rules_applied,
    findings: normalized.findings,
    fixes: normalized.fixes,
    changes: normalized.changes,
    errors: normalized.errors,
    rules,
  };
}

/** Builds a typed Integrations ORL report event for GitHub Actions PR scans. */
export function buildCreateOrlReportEventBody(args: {
  orlReport: OrlReport;
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
  const orlReport = toIntegrationsOrlReport(args.orlReport);

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
