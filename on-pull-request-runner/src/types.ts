/**
 * Shared types for ORL reports, workspace discovery, and evaluation batches.
 */

/** One rule entry inside `report.yaml` `spec.rules`. */
export type OrlReportRule = {
  name: string;
  findings?: number;
  fixes?: number;
  files?: Array<{ path: string }>;
  files_changed?: Record<string, unknown>;
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
