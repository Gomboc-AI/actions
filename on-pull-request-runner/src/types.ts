/**
 * Shared types for ORL reports, workspace discovery, and evaluation batches.
 */
import type { CreateOrlReportEventRequestBody } from '@gomboc-ai/gomboc-node-sdk';

/** ORL report payload accepted by Integrations `createOrlReportEvent`. */
export type IntegrationsOrlReport = NonNullable<
  NonNullable<CreateOrlReportEventRequestBody['reports'][number]>['orlReport']
>;

export type IntegrationsOrlReportGitHub = {
  repository: string;
  prNumber: number;
  headSha: string;
};

/** File/line anchor in an ORL report (`Location` in report schema). */
export type OrlLocation = {
  id?: string;
  file_path: string;
  start_line: number;
  end_line?: number;
  start_column?: number;
  end_column?: number;
};

/** One finding row with original and optional resolved location. */
export type OrlFindingLocationRow = {
  id: string;
  original_location?: OrlLocation;
  resolved_location?: OrlLocation;
  resolution_status?: string;
};

/** One rule entry inside `report.yaml` `spec.rules`. */
export type OrlReportRule = {
  name: string;
  findings?: number;
  fixes?: number;
  changes?: number;
  files?: Array<{ path: string }>;
  paths_with_findings?: Record<string, unknown>;
  files_changed?: Record<string, unknown>;
  finding_locations?: OrlFindingLocationRow[];
  errors?: unknown[];
  metadata?: {
    name?: string;
    display_name?: string;
    description?: string;
    classifications?: string[];
    annotations?: Record<string, string>;
  };
};

/** Parsed ORL `report.yaml` top-level shape. */
export type OrlReport = {
  metadata: {
    name: string;
    display_name?: string;
    description?: string;
  };
  spec: {
    workspace?: string;
    language?: string;
    rules_applied: number;
    findings: number;
    fixes: number;
    changes: number;
    rules: OrlReportRule[];
    errors: string[];
  };
};

/** One parallel `orl remediate` run: workspace × ORL language × file list. */
export type EvaluationBatch = {
  batchId: string;
  workspacePath: string;
  orlLanguage: string;
  files: string[];
};

/** Workspace touched by the PR with detected languages and relevant changed paths. */
export type TouchedWorkspace = {
  workspacePath: string;
  languages: Array<{ name: string }>;
  changedFiles: string[];
};

/** Single entry from `orl detect-language` JSON output. */
export type DetectLanguageEntry = {
  name: string;
  recursionDefault?: boolean;
  ruleSpaceRuleCount?: number;
};
