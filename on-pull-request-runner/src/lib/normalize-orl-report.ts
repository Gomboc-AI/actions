/**
 * Flattens parsed ORL `report.yaml` for Integrations and PR summary consumption.
 */
import { totalsFromReport } from './report-counts.js';
import type { NormalizedOrlReport, OrlReport } from '../types.js';

function trimDescription(desc: string | undefined, max = 500): string | undefined {
  if (!desc) return desc;
  return desc.length > max ? desc.slice(0, max) + '…' : desc;
}

export function normalizeOrlReport(report: OrlReport): NormalizedOrlReport {
  const spec = report.spec;
  const totals = totalsFromReport(report);
  const displayName = report.metadata.display_name?.trim();

  const metadata: NormalizedOrlReport['metadata'] = {
    name: report.metadata.name,
    description: trimDescription(report.metadata.description),
    ...(displayName
      ? { annotations: { display_name: displayName } }
      : {}),
  };

  return {
    type: 'Report',
    version: 'v1',
    metadata,
    workspace: spec.workspace ?? '.',
    language: spec.language ?? 'unknown',
    rules_applied: spec.rules_applied ?? spec.rules?.length ?? 0,
    findings: totals.findings,
    fixes: totals.fixes,
    changes: totals.changes,
    rules: spec.rules ?? [],
    errors: spec.errors ?? [],
  };
}
