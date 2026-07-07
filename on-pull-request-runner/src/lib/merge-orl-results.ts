/**
 * Aggregates per-batch ORL reports and diagnostics into a single merged outcome.
 */
import type { OrlReport, OrlReportRule } from '../types.js';
import { formatBatchExitWarning } from './orl-exit-codes.js';
import {
  formatBatchTimeoutWarning,
  isOrlTimeoutResult,
} from './orl-timeout.js';
import { countRuleFindings } from './report-counts.js';

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
    type: 'Report',
    version: 'v1',
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
 * Exit code 1 from an ORL `--timeout` hit is treated as a warning only.
 */
export function mergeBatchResults(results: BatchResult[]): MergeOutcome {
  const warnings: string[] = [];
  let hadExecutionFailure = false;

  for (const r of results) {
    const timedOut = isOrlTimeoutResult({ error: r.error, report: r.report });
    if (r.exitCode === 1 && !timedOut) {
      hadExecutionFailure = true;
    }
    if (timedOut) {
      warnings.push(formatBatchTimeoutWarning(r));
    } else if (r.exitCode === 2 || r.exitCode === 3) {
      warnings.push(formatBatchExitWarning(r));
    }
  }

  const merged = emptyReport();
  const diagRules: unknown[] = [];

  for (const r of results) {
    if (!r.report?.spec) continue;
    const spec = r.report.spec;
    let fromRules = 0;
    let fromRuleFixes = 0;
    let fromRuleChanges = 0;
    for (const rule of spec.rules ?? []) {
      fromRules += countRuleFindings(rule);
      fromRuleFixes += rule.fixes ?? 0;
      fromRuleChanges += rule.changes ?? 0;
    }
    merged.spec.rules_applied += spec.rules_applied ?? 0;
    merged.spec.findings += Math.max(spec.findings ?? 0, fromRules);
    merged.spec.fixes += Math.max(spec.fixes ?? 0, fromRuleFixes);
    merged.spec.changes += Math.max(spec.changes ?? 0, fromRuleChanges);
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
