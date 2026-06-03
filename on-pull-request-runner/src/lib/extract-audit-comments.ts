/**
 * Builds inline PR comment candidates from ORL batch reports and diagnostics.
 */
import type { EvaluationBatch, OrlReport, OrlReportRule } from '../types.js';
import { normalizeReportFilePath, reportPathToRepoPath } from './normalize-report-path.js';

export const AUDIT_COMMENT_MARKER = '<!-- gomboc-orl-audit -->';

export type AuditCommentCandidate = {
  dedupeKey: string;
  ruleName: string;
  displayName: string;
  description?: string;
  severity?: string;
  risk?: string;
  filePath: string;
  line: number;
  startLine?: number;
  endLine?: number;
};

export type DiagnosticsShape = {
  version?: number;
  rules?: DiagnosticsRule[];
};

type DiagnosticsRule = {
  ruleName?: string;
  files?: DiagnosticsFile[];
};

type DiagnosticsFile = {
  path?: string;
  hunks?: Array<{ startLine?: number; endLine?: number; lineCount?: number }>;
  resources?: Array<{ startLine?: number; endLine?: number }>;
};

export type ExtractAuditCommentsArgs = {
  batches: EvaluationBatch[];
  batchReports: Array<{ batchId: string; workspacePath: string; report: OrlReport }>;
  batchDiagnostics: Array<{ batchId: string; diagnostics: DiagnosticsShape | null }>;
  prScannableFiles: Set<string>;
};

function pickAnnotation(
  annotations: Record<string, string> | undefined,
  keys: string[]
): string | undefined {
  if (!annotations) return undefined;
  const lower = new Map(
    Object.entries(annotations).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const key of keys) {
    const hit = lower.get(key.toLowerCase());
    if (hit) return hit;
  }
  for (const [k, v] of Object.entries(annotations)) {
    const lk = k.toLowerCase();
    for (const key of keys) {
      if (lk === key.toLowerCase() || lk.endsWith(`/${key.toLowerCase()}`)) {
        return v;
      }
    }
  }
  return undefined;
}

function ruleMeta(rule: OrlReportRule): {
  displayName: string;
  description?: string;
  severity?: string;
  risk?: string;
} {
  const meta = rule.metadata;
  const annotations = meta?.annotations;
  return {
    displayName: meta?.display_name ?? meta?.name ?? rule.name,
    description: meta?.description,
    severity: pickAnnotation(annotations, [
      'severity',
      'policy/severity',
      'gomboc.ai/severity',
    ]),
    risk: pickAnnotation(annotations, ['risk', 'risk/level', 'policy/risk', 'gomboc.ai/risk']),
  };
}

function lineFromReportEntry(entry: unknown): {
  line: number;
  startLine?: number;
  endLine?: number;
} | null {
  if (entry == null) return null;
  if (typeof entry === 'number' && entry > 0) {
    return { line: entry };
  }
  if (typeof entry !== 'object') return null;

  const o = entry as Record<string, unknown>;
  for (const key of ['line', 'startLine', 'start_line']) {
    const v = o[key];
    if (typeof v === 'number' && v > 0) {
      const end =
        typeof o.endLine === 'number'
          ? o.endLine
          : typeof o.end_line === 'number'
            ? o.end_line
            : undefined;
      return { line: v, startLine: v, endLine: end };
    }
  }

  const hunks = o.hunks;
  if (Array.isArray(hunks)) {
    for (const h of hunks) {
      if (h && typeof h === 'object') {
        const start = (h as { startLine?: number }).startLine;
        if (typeof start === 'number' && start > 0) {
          const end = (h as { endLine?: number }).endLine;
          return { line: start, startLine: start, endLine: end };
        }
      }
    }
  }

  const resources = o.resources;
  if (Array.isArray(resources)) {
    for (const r of resources) {
      if (r && typeof r === 'object') {
        const start = (r as { startLine?: number }).startLine;
        if (typeof start === 'number' && start > 0) {
          const end = (r as { endLine?: number }).endLine;
          return { line: start, startLine: start, endLine: end };
        }
      }
    }
  }

  return null;
}

function lineFromDiagnostics(args: {
  diagnostics: DiagnosticsShape | null;
  ruleName: string;
  repoPath: string;
}): { line: number; startLine?: number; endLine?: number } | null {
  const { diagnostics, ruleName, repoPath } = args;
  if (!diagnostics?.rules?.length) return null;

  const normalizedTarget = normalizeReportFilePath(repoPath);
  for (const dr of diagnostics.rules) {
    if (dr.ruleName && dr.ruleName !== ruleName) continue;
    for (const file of dr.files ?? []) {
      if (!file.path) continue;
      if (normalizeReportFilePath(file.path) !== normalizedTarget) continue;

      for (const h of file.hunks ?? []) {
        if (typeof h.startLine === 'number' && h.startLine > 0) {
          return { line: h.startLine, startLine: h.startLine, endLine: h.endLine };
        }
      }
      for (const r of file.resources ?? []) {
        if (typeof r.startLine === 'number' && r.startLine > 0) {
          return { line: r.startLine, startLine: r.startLine, endLine: r.endLine };
        }
      }
    }
  }
  return null;
}

function pathsFromRule(rule: OrlReportRule): Array<{ path: string; entry: unknown }> {
  const out = new Map<string, unknown>();

  for (const [path, entry] of Object.entries(rule.paths_with_findings ?? {})) {
    out.set(path, entry);
  }
  for (const [path, entry] of Object.entries(rule.files_changed ?? {})) {
    if (!out.has(path)) out.set(path, entry);
  }
  if (out.size === 0) {
    for (const file of rule.files ?? []) {
      if (file.path) out.set(file.path, {});
    }
  }
  return [...out.entries()].map(([path, entry]) => ({ path, entry }));
}

function diagnosticsForBatch(
  batchDiagnostics: ExtractAuditCommentsArgs['batchDiagnostics'],
  batchId: string
): DiagnosticsShape | null {
  return batchDiagnostics.find((b) => b.batchId === batchId)?.diagnostics ?? null;
}

/** Collects deduped inline comment anchors limited to PR-scannable paths. */
export function extractAuditCommentCandidates(
  args: ExtractAuditCommentsArgs
): AuditCommentCandidate[] {
  const { batchReports, batchDiagnostics, prScannableFiles } = args;
  const seen = new Set<string>();
  const candidates: AuditCommentCandidate[] = [];

  for (const { batchId, workspacePath, report } of batchReports) {
    const diagnostics = diagnosticsForBatch(batchDiagnostics, batchId);

    for (const rule of report.spec?.rules ?? []) {
      if ((rule.findings ?? 0) <= 0 && pathsFromRule(rule).length === 0) continue;

      const meta = ruleMeta(rule);
      const pathEntries = pathsFromRule(rule);

      if (pathEntries.length === 0 && (rule.findings ?? 0) > 0) {
        for (const dr of diagnostics?.rules ?? []) {
          if (dr.ruleName && dr.ruleName !== rule.name) continue;
          for (const file of dr.files ?? []) {
            if (!file.path) continue;
            pathEntries.push({ path: file.path, entry: file });
          }
        }
      }

      for (const { path, entry } of pathEntries) {
        const repoPath = reportPathToRepoPath({ reportPath: path, workspacePath });
        if (!prScannableFiles.has(repoPath)) continue;

        let anchor =
          lineFromReportEntry(entry) ??
          lineFromDiagnostics({ diagnostics, ruleName: rule.name, repoPath });

        if (!anchor) continue;

        const dedupeKey = `${rule.name}:${repoPath}:${anchor.line}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        candidates.push({
          dedupeKey,
          ruleName: rule.name,
          displayName: meta.displayName,
          description: meta.description,
          severity: meta.severity,
          risk: meta.risk,
          filePath: repoPath,
          line: anchor.line,
          startLine: anchor.startLine,
          endLine: anchor.endLine,
        });
      }
    }
  }

  return candidates;
}

export function formatInlineCommentBody(candidate: AuditCommentCandidate): string {
  const lines = [AUDIT_COMMENT_MARKER, `**Gomboc ORL:** ${candidate.displayName}`, ''];

  const metaRows: string[] = [];
  if (candidate.severity) metaRows.push(`| Severity | ${candidate.severity} |`);
  if (candidate.risk) metaRows.push(`| Risk | ${candidate.risk} |`);
  if (metaRows.length) {
    lines.push('| | |', '|---|---|', ...metaRows, '');
  }

  if (candidate.description) {
    lines.push(candidate.description.trim(), '');
  }

  lines.push(`\`${candidate.ruleName}\``);
  return lines.join('\n');
}
