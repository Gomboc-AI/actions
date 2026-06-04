/**
 * Builds inline PR comment candidates from ORL batch reports and diagnostics.
 *
 * Primary anchor source: `spec.rules[].finding_locations` (ORL report schema).
 */
import type {
  EvaluationBatch,
  OrlFindingLocationRow,
  OrlLocation,
  OrlReport,
  OrlReportRule,
} from '../types.js';
import { normalizeReportFilePath, reportPathToRepoPath } from './normalize-report-path.js';
import { formatScoreCell, ruleDescription, ruleImpactRisk } from './rule-metadata.js';
import { portalRuleUrl } from './portal-url.js';
import { resolveScannablePath } from './scannable-path.js';

export const AUDIT_COMMENT_MARKER = '<!-- gomboc-orl-audit -->';

export function auditCommentMarker(dedupeKey: string): string {
  return `<!-- gomboc-orl-audit key=${dedupeKey} -->`;
}

export function isAuditCommentBody(body: string): boolean {
  return body.includes('gomboc-orl-audit');
}

const AUDIT_DEDUPE_KEY_RE = /<!-- gomboc-orl-audit(?: key=([^\s>]+))? -->/;

export function parseAuditCommentDedupeKey(body: string): string | null {
  const match = body.match(AUDIT_DEDUPE_KEY_RE);
  if (!match) return null;
  return match[1] ?? null;
}

export type AuditCommentCandidate = {
  dedupeKey: string;
  ruleName: string;
  displayName: string;
  description?: string;
  impact?: string;
  impactStatement?: string;
  risk?: string;
  riskStatement?: string;
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
  /** PR diff changed lines per scannable file (fallback when report has path but no line). */
  diffChangedLines?: Map<string, number[]>;
};

function ruleMeta(rule: OrlReportRule): {
  displayName: string;
  description?: string;
  impact?: string;
  impactStatement?: string;
  risk?: string;
  riskStatement?: string;
} {
  const meta = rule.metadata;
  const { impact, impactStatement, risk, riskStatement } = ruleImpactRisk(rule);
  return {
    displayName: meta?.display_name ?? meta?.name ?? rule.name,
    description: ruleDescription(rule),
    impact,
    impactStatement,
    risk,
    riskStatement,
  };
}

function anchorFromLocation(loc: OrlLocation): {
  line: number;
  startLine?: number;
  endLine?: number;
} | null {
  if (typeof loc.start_line !== 'number' || loc.start_line <= 0) return null;
  return {
    line: loc.start_line,
    startLine: loc.start_line,
    endLine: typeof loc.end_line === 'number' ? loc.end_line : undefined,
  };
}

function locationFromFindingRow(row: OrlFindingLocationRow): OrlLocation | null {
  return row.resolved_location ?? row.original_location ?? null;
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

  const asLocation = o as Partial<OrlLocation>;
  if (typeof asLocation.file_path === 'string' && typeof asLocation.start_line === 'number') {
    return anchorFromLocation(asLocation as OrlLocation);
  }

  for (const key of ['line', 'startLine', 'start_line', 'line_number', 'lineNumber']) {
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

  for (const nestedKey of [
    'resource_changes',
    'resource_change',
    'output_changes',
    'changes',
    'findings',
  ]) {
    if (nestedKey in o) {
      const nested = lineFromReportEntry(o[nestedKey]);
      if (nested) return nested;
    }
  }

  if (Array.isArray(entry)) {
    for (const item of entry) {
      const nested = lineFromReportEntry(item);
      if (nested) return nested;
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

function firstDiffLine(
  diffChangedLines: Map<string, number[]> | undefined,
  scannablePath: string
): number | null {
  const lines = diffChangedLines?.get(scannablePath);
  if (!lines?.length) return null;
  return lines[0];
}

type AnchorAttempt = {
  scannablePath: string;
  anchor: { line: number; startLine?: number; endLine?: number };
  dedupeKey: string;
};

function tryFindingLocationRows(args: {
  rule: OrlReportRule;
  workspacePath: string;
  prScannableFiles: Set<string>;
}): AnchorAttempt[] {
  const { rule, workspacePath, prScannableFiles } = args;
  const out: AnchorAttempt[] = [];

  for (const row of rule.finding_locations ?? []) {
    const loc = locationFromFindingRow(row);
    if (!loc?.file_path) continue;

    const repoPath = reportPathToRepoPath({
      reportPath: loc.file_path,
      workspacePath,
    });
    const scannablePath = resolveScannablePath(repoPath, prScannableFiles);
    if (!scannablePath) continue;

    const anchor = anchorFromLocation(loc);
    if (!anchor) continue;

    out.push({
      scannablePath,
      anchor,
      dedupeKey: `${rule.name}:${scannablePath}:${anchor.line}:${row.id}`,
    });
  }

  return out;
}

function tryLegacyPaths(args: {
  rule: OrlReportRule;
  workspacePath: string;
  diagnostics: DiagnosticsShape | null;
  prScannableFiles: Set<string>;
  diffChangedLines?: Map<string, number[]>;
}): AnchorAttempt[] {
  const { rule, workspacePath, diagnostics, prScannableFiles, diffChangedLines } = args;
  const out: AnchorAttempt[] = [];
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
    const scannablePath = resolveScannablePath(repoPath, prScannableFiles);
    if (!scannablePath) continue;

    let anchor =
      lineFromReportEntry(entry) ??
      lineFromDiagnostics({ diagnostics, ruleName: rule.name, repoPath: scannablePath });

    if (!anchor) {
      const diffLine = firstDiffLine(diffChangedLines, scannablePath);
      if (diffLine) anchor = { line: diffLine, startLine: diffLine };
    }
    if (!anchor) continue;

    out.push({
      scannablePath,
      anchor,
      dedupeKey: `${rule.name}:${scannablePath}:${anchor.line}`,
    });
  }

  return out;
}

/** Collects deduped inline comment anchors limited to PR-scannable paths. */
export function extractAuditCommentCandidates(
  args: ExtractAuditCommentsArgs
): AuditCommentCandidate[] {
  const { batchReports, batchDiagnostics, prScannableFiles, diffChangedLines } = args;
  const seen = new Set<string>();
  const candidates: AuditCommentCandidate[] = [];

  for (const { batchId, workspacePath, report } of batchReports) {
    const diagnostics = diagnosticsForBatch(batchDiagnostics, batchId);

    for (const rule of report.spec?.rules ?? []) {
      if ((rule.findings ?? 0) <= 0 && !(rule.finding_locations?.length ?? 0)) {
        if (pathsFromRule(rule).length === 0) continue;
      }

      const meta = ruleMeta(rule);
      const attempts = [
        ...tryFindingLocationRows({ rule, workspacePath, prScannableFiles }),
        ...tryLegacyPaths({
          rule,
          workspacePath,
          diagnostics,
          prScannableFiles,
          diffChangedLines,
        }),
      ];

      for (const attempt of attempts) {
        if (seen.has(attempt.dedupeKey)) continue;
        seen.add(attempt.dedupeKey);

        candidates.push({
          dedupeKey: attempt.dedupeKey,
          ruleName: rule.name,
          displayName: meta.displayName,
          description: meta.description,
          impact: meta.impact,
          impactStatement: meta.impactStatement,
          risk: meta.risk,
          riskStatement: meta.riskStatement,
          filePath: attempt.scannablePath,
          line: attempt.anchor.line,
          startLine: attempt.anchor.startLine,
          endLine: attempt.anchor.endLine,
        });
      }
    }
  }

  return candidates;
}

export type FormatInlineCommentOptions = {
  portalServiceUrl?: string;
};

function formatScoreLabel(score: string | undefined): string {
  const cell = formatScoreCell(score);
  return cell === '—' ? cell : cell.toUpperCase();
}

function formatSeverityRiskAccordion(args: {
  label: 'Severity' | 'Risk';
  score: string | undefined;
  statement: string | undefined;
}): string[] {
  const title = `### ${args.label}: \`${formatScoreLabel(args.score)}\``;
  const statement = args.statement?.trim();
  if (!statement) {
    return [title, ''];
  }

  return [
    '<details>',
    '',
    '<summary>',
    '',
    title,
    '',
    '</summary>',
    '',
    statement,
    '',
    '</details>',
    '',
  ];
}

/** Removes a leading `## Description` heading from rule metadata text. */
export function stripDescriptionHeading(description: string): string {
  return description.trim().replace(/^##\s+Description\s*\n*/i, '').trim();
}

function formatDescriptionWithReadMore(args: {
  description: string;
  portalServiceUrl?: string;
  ruleName: string;
}): string | null {
  const text = args.description.trim();
  const portal = args.portalServiceUrl?.trim();
  if (!text && !portal) return null;

  if (portal) {
    const href = portalRuleUrl({
      portalBaseUrl: portal,
      ruleName: args.ruleName,
    });
    const readMore = `[Read more](${href})`;
    return text ? `${text} ${readMore}` : readMore;
  }

  return text;
}

export function formatInlineCommentBody(
  candidate: AuditCommentCandidate,
  options: FormatInlineCommentOptions = {}
): string {
  const lines = [auditCommentMarker(candidate.dedupeKey), `### ${candidate.displayName}`, ''];

  const description = candidate.description
    ? stripDescriptionHeading(candidate.description)
    : '';
  const descriptionBlock = formatDescriptionWithReadMore({
    description,
    portalServiceUrl: options.portalServiceUrl,
    ruleName: candidate.ruleName,
  });
  if (descriptionBlock) {
    lines.push(descriptionBlock, '');
  }

  lines.push(
    ...formatSeverityRiskAccordion({
      label: 'Severity',
      score: candidate.impact,
      statement: candidate.impactStatement,
    }),
    ...formatSeverityRiskAccordion({
      label: 'Risk',
      score: candidate.risk,
      statement: candidate.riskStatement,
    })
  );

  return lines.join('\n').trimEnd();
}
