/**
 * Aggregates per-batch ORL reports and diagnostics into a single merged outcome.
 */
import type { OrlReport } from '../types.js';

/** Result of one parallel `orl remediate` docker invocation. */
export type BatchResult = {
  batchId: string;
  workspacePath: string;
  orlLanguage: string;
  exitCode: number;
  report: OrlReport | null;
  diagnostics: unknown | null;
  error?: string;
};

/** Combined reports, diagnostics, and execution flags after all batches finish. */
export type MergeOutcome = {
  mergedReport: OrlReport;
  mergedDiagnostics: { version?: number; rules?: unknown[] };
  hadExecutionFailure: boolean;
  warnings: string[];
};

function emptyReport(): OrlReport {
  return {
    metadata: { name: 'merged', display_name: 'Gomboc ORL (merged)' },
    spec: {
      workspace: '.',
      language: 'unknown',
      rules_applied: 0,
      findings: 0,
      fixes: 0,
      changes: 0,
      rules: [],
      errors: [],
    },
  };
}

/**
 * Sums counts and concatenates rules/errors/diagnostics across batches.
 * Exit code 1 on any batch sets `hadExecutionFailure`; 2/3 add warnings only.
 */
export function mergeBatchResults(results: BatchResult[]): MergeOutcome {
  const warnings: string[] = [];
  let hadExecutionFailure = false;

  for (const r of results) {
    if (r.exitCode === 1) hadExecutionFailure = true;
    if (r.exitCode === 2 || r.exitCode === 3) {
      warnings.push(
        `Batch ${r.batchId} (${r.workspacePath}/${r.orlLanguage}) exited with code ${r.exitCode}`
      );
    }
  }

  const merged = emptyReport();
  const diagRules: unknown[] = [];

  for (const r of results) {
    if (!r.report?.spec) continue;
    const spec = r.report.spec;
    merged.spec.rules_applied += spec.rules_applied ?? 0;
    merged.spec.findings += spec.findings ?? 0;
    merged.spec.fixes += spec.fixes ?? 0;
    merged.spec.changes += spec.changes ?? 0;
    if (spec.rules?.length) {
      merged.spec.rules.push(...spec.rules);
    }
    if (spec.errors?.length) {
      merged.spec.errors.push(...spec.errors);
    }
    if (spec.language && spec.language !== 'unknown') {
      merged.spec.language = spec.language;
    }
    if (spec.workspace) {
      merged.spec.workspace = spec.workspace;
    }

    const d = r.diagnostics as { rules?: unknown[] } | null;
    if (d?.rules?.length) {
      diagRules.push(...d.rules);
    }
  }

  return {
    mergedReport: merged,
    mergedDiagnostics: { version: 1, rules: diagRules },
    hadExecutionFailure,
    warnings,
  };
}
