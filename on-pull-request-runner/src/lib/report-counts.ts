/**
 * Consistent finding/fix/change totals from ORL report.yaml structures.
 */
import type { OrlReport, OrlReportRule } from '../types.js';

/** Findings for one rule; falls back to `finding_locations` length when count is 0. */
export function countRuleFindings(rule: OrlReportRule): number {
  const n = rule.findings ?? 0;
  if (n > 0) return n;
  return rule.finding_locations?.length ?? 0;
}

export type ReportTotals = {
  findings: number;
  fixes: number;
  changes: number;
};

function totalsFromRules(rules: OrlReportRule[]): ReportTotals {
  let findings = 0;
  let fixes = 0;
  let changes = 0;
  for (const rule of rules) {
    findings += countRuleFindings(rule);
    fixes += rule.fixes ?? 0;
    changes += rule.changes ?? 0;
  }
  return { findings, fixes, changes };
}

/** Totals for one report; prefers the higher of spec-level vs rule-level sums. */
export function totalsFromReport(report: OrlReport | null | undefined): ReportTotals {
  if (!report?.spec) {
    return { findings: 0, fixes: 0, changes: 0 };
  }
  const spec = report.spec;
  const fromRules = totalsFromRules(spec.rules ?? []);
  return {
    findings: Math.max(spec.findings ?? 0, fromRules.findings),
    fixes: Math.max(spec.fixes ?? 0, fromRules.fixes),
    changes: Math.max(spec.changes ?? 0, fromRules.changes),
  };
}

/** Sums totals across batch reports (merged view). */
export function totalsFromBatchReports(
  batchReports: Array<{ report: OrlReport }>
): ReportTotals {
  let findings = 0;
  let fixes = 0;
  let changes = 0;
  for (const { report } of batchReports) {
    const t = totalsFromReport(report);
    findings += t.findings;
    fixes += t.fixes;
    changes += t.changes;
  }
  return { findings, fixes, changes };
}
