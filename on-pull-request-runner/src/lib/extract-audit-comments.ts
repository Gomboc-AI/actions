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
import { formatScoreLabel, ruleDescription, ruleImpactRisk } from './rule-metadata.js';
import { portalRuleUrl } from './portal-url.js';
import { resolveScannablePath } from './scannable-path.js';
import { countRuleFindings } from './report-counts.js';
import { compareRulesByImpactRisk } from './rule-metadata.js';

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
  /**
   * `audit`: anchor at ORL finding locations (original PR review).
   * `remediation`: anchor each finding on a distinct line from the remediation PR diff.
   */
  anchorStrategy?: 'audit' | 'remediation';
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
  ruleName?: string;
};

/** One inline comment per rule × file × line (ignores finding row id). */
export function canonicalAnchorDedupeKey(
  ruleName: string,
  scannablePath: string,
  line: number
): string {
  return `${ruleName}:${scannablePath}:${line}`;
}

/** One inline comment per finding on remediation PRs. */
export function remediationFindingDedupeKey(
  ruleName: string,
  findingId: string,
  scannablePath: string,
  line: number
): string {
  return `${ruleName}:${findingId}:${scannablePath}:${line}`;
}

function preferredLineFromFindingRow(args: {
  row: OrlFindingLocationRow;
  rule: OrlReportRule;
  workspacePath: string;
  scannablePath: string;
  diagnostics: DiagnosticsShape | null;
}): number | null {
  const loc = locationFromFindingRow(args.row);
  const fromLoc = loc ? anchorFromLocation(loc)?.line : null;
  if (fromLoc) return fromLoc;

  for (const { path, entry } of pathsFromRule(args.rule)) {
    const repoPath = reportPathToRepoPath({
      reportPath: path,
      workspacePath: args.workspacePath,
    });
    if (repoPath !== args.scannablePath) continue;
    const fromEntry = lineFromReportEntry(entry)?.line;
    if (fromEntry) return fromEntry;
  }

  const fromDiag = lineFromDiagnostics({
    diagnostics: args.diagnostics,
    ruleName: args.rule.name,
    repoPath: args.scannablePath,
  })?.line;
  return fromDiag ?? null;
}

/**
 * Maps each finding to a distinct changed line in the PR diff when possible.
 * Exported for tests.
 */
export function assignRemediationAnchorLines(args: {
  rows: OrlFindingLocationRow[];
  changedLines: number[];
  preferredLines: Array<number | null>;
}): Array<number | null> {
  const { rows, changedLines, preferredLines } = args;
  if (!changedLines.length) {
    return rows.map(() => null);
  }

  const sortedChanged = [...new Set(changedLines)].sort((a, b) => a - b);
  const used = new Set<number>();
  const order = rows
    .map((row, index) => ({ index, preferred: preferredLines[index] ?? 0, id: row.id }))
    .sort((a, b) => a.preferred - b.preferred || a.id.localeCompare(b.id));

  const assigned: Array<number | null> = rows.map(() => null);

  for (const { index, preferred } of order) {
    let line: number | null = null;

    if (preferred > 0 && sortedChanged.includes(preferred) && !used.has(preferred)) {
      line = preferred;
    } else if (preferred > 0) {
      let bestDist = Number.POSITIVE_INFINITY;
      for (const candidate of sortedChanged) {
        if (used.has(candidate)) continue;
        const dist = Math.abs(candidate - preferred);
        if (dist < bestDist) {
          bestDist = dist;
          line = candidate;
        }
      }
    }

    if (line == null) {
      line = sortedChanged.find((candidate) => !used.has(candidate)) ?? null;
    }

    if (line == null) {
      line = sortedChanged.reduce((closest, candidate) => {
        if (closest == null) return candidate;
        const preferredDist = Math.abs(candidate - preferred);
        const closestDist = Math.abs(closest - preferred);
        return preferredDist < closestDist ? candidate : closest;
      }, null as number | null);
    }

    if (line == null) continue;
    assigned[index] = line;
    used.add(line);
  }

  return assigned;
}

function tryRemediationFindingRows(args: {
  rules: Array<{ rule: OrlReportRule; workspacePath: string; diagnostics: DiagnosticsShape | null }>;
  prScannableFiles: Set<string>;
  diffChangedLines?: Map<string, number[]>;
}): AnchorAttempt[] {
  const { rules, prScannableFiles, diffChangedLines } = args;

  type RowContext = {
    rule: OrlReportRule;
    row: OrlFindingLocationRow;
    scannablePath: string;
    preferredLine: number | null;
  };

  const byFile = new Map<string, RowContext[]>();

  for (const { rule, workspacePath, diagnostics } of rules) {
    for (const row of rule.finding_locations ?? []) {
      const loc = locationFromFindingRow(row);
      if (!loc?.file_path) continue;

      const repoPath = reportPathToRepoPath({
        reportPath: loc.file_path,
        workspacePath,
      });
      const scannablePath = resolveScannablePath(repoPath, prScannableFiles);
      if (!scannablePath) continue;

      const preferredLine = preferredLineFromFindingRow({
        row,
        rule,
        workspacePath,
        scannablePath,
        diagnostics,
      });

      const bucket = byFile.get(scannablePath) ?? [];
      bucket.push({ rule, row, scannablePath, preferredLine });
      byFile.set(scannablePath, bucket);
    }
  }

  const out: AnchorAttempt[] = [];

  for (const [scannablePath, contexts] of byFile) {
    const changedLines = diffChangedLines?.get(scannablePath) ?? [];
    const assigned = assignRemediationAnchorLines({
      rows: contexts.map((ctx) => ctx.row),
      changedLines,
      preferredLines: contexts.map((ctx) => ctx.preferredLine),
    });

    for (let i = 0; i < contexts.length; i++) {
      const line = assigned[i];
      if (line == null) continue;
      const { rule, row } = contexts[i]!;
      const findingId = row.id || `finding-${i}`;
      out.push({
        scannablePath,
        anchor: { line, startLine: line },
        dedupeKey: remediationFindingDedupeKey(rule.name, findingId, scannablePath, line),
        ruleName: rule.name,
      });
    }
  }

  return out;
}

function snapLegacyAttemptsToDiff(args: {
  ruleName: string;
  attempts: AnchorAttempt[];
  diffChangedLines?: Map<string, number[]>;
}): AnchorAttempt[] {
  const { ruleName, attempts, diffChangedLines } = args;
  if (!diffChangedLines?.size) return attempts;

  const byFile = new Map<string, AnchorAttempt[]>();
  for (const attempt of attempts) {
    const bucket = byFile.get(attempt.scannablePath) ?? [];
    bucket.push(attempt);
    byFile.set(attempt.scannablePath, bucket);
  }

  const out: AnchorAttempt[] = [];
  for (const [scannablePath, fileAttempts] of byFile) {
    const changedLines = diffChangedLines.get(scannablePath) ?? [];
    const assigned = assignRemediationAnchorLines({
      rows: fileAttempts.map((_, index) => ({ id: `legacy-${index}` })),
      changedLines,
      preferredLines: fileAttempts.map((attempt) => attempt.anchor.line),
    });

    for (let i = 0; i < fileAttempts.length; i++) {
      const line = assigned[i];
      const attempt = fileAttempts[i]!;
      if (line == null) continue;
      out.push({
        ...attempt,
        anchor: { line, startLine: line, endLine: attempt.anchor.endLine },
        dedupeKey: remediationFindingDedupeKey(
          ruleName,
          `legacy-${i}`,
          scannablePath,
          line
        ),
      });
    }
  }

  return out;
}

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
      dedupeKey: canonicalAnchorDedupeKey(rule.name, scannablePath, anchor.line),
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

  if (pathEntries.length === 0 && countRuleFindings(rule) > 0) {
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
      dedupeKey: canonicalAnchorDedupeKey(rule.name, scannablePath, anchor.line),
    });
  }

  return out;
}

/** Collects deduped inline comment anchors limited to PR-scannable paths. */
export function extractAuditCommentCandidates(
  args: ExtractAuditCommentsArgs
): AuditCommentCandidate[] {
  const {
    batchReports,
    batchDiagnostics,
    prScannableFiles,
    diffChangedLines,
    anchorStrategy = 'audit',
  } = args;
  const seen = new Set<string>();
  const candidates: AuditCommentCandidate[] = [];
  const rulesByName = new Map<string, OrlReportRule>();

  for (const { batchId, workspacePath, report } of batchReports) {
    const diagnostics = diagnosticsForBatch(batchDiagnostics, batchId);
    const batchRules = report.spec?.rules ?? [];

    for (const rule of batchRules) {
      rulesByName.set(rule.name, rule);
    }

    if (anchorStrategy === 'remediation') {
      const eligibleRules = batchRules.filter(
        (rule) =>
          (rule.finding_locations?.length ?? 0) > 0 ||
          countRuleFindings(rule) > 0 ||
          pathsFromRule(rule).length > 0
      );

      const remediationAttempts = tryRemediationFindingRows({
        rules: eligibleRules
          .filter((rule) => (rule.finding_locations?.length ?? 0) > 0)
          .map((rule) => ({ rule, workspacePath, diagnostics })),
        prScannableFiles,
        diffChangedLines,
      });

      const remediationRulesWithAttempts = new Set(
        remediationAttempts.map((attempt) => attempt.ruleName).filter(Boolean)
      );

      for (const attempt of remediationAttempts) {
        const rule = rulesByName.get(attempt.ruleName ?? '');
        if (!rule) continue;
        if (seen.has(attempt.dedupeKey)) continue;
        seen.add(attempt.dedupeKey);
        const meta = ruleMeta(rule);
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

      for (const rule of eligibleRules) {
        if (remediationRulesWithAttempts.has(rule.name)) continue;
        const attempts = snapLegacyAttemptsToDiff({
          ruleName: rule.name,
          attempts: tryLegacyPaths({
            rule,
            workspacePath,
            diagnostics,
            prScannableFiles,
            diffChangedLines,
          }),
          diffChangedLines,
        });

        for (const attempt of attempts) {
          if (seen.has(attempt.dedupeKey)) continue;
          seen.add(attempt.dedupeKey);
          const meta = ruleMeta(rule);
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

      continue;
    }

    for (const rule of batchRules) {
      if (countRuleFindings(rule) <= 0 && !(rule.finding_locations?.length ?? 0)) {
        if (pathsFromRule(rule).length === 0) continue;
      }

      const meta = ruleMeta(rule);
      const locationRows = tryFindingLocationRows({
        rule,
        workspacePath,
        prScannableFiles,
      });
      const attempts =
        locationRows.length > 0
          ? locationRows
          : tryLegacyPaths({
              rule,
              workspacePath,
              diagnostics,
              prScannableFiles,
              diffChangedLines,
            });

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

/**
 * Limits inline comments to each rule's finding count (ORL may emit more
 * `finding_locations` rows than `findings`). Optionally caps to report total.
 */
export function capAuditCommentCandidates(args: {
  candidates: AuditCommentCandidate[];
  rules: OrlReportRule[];
  totalFindingsCap?: number;
}): AuditCommentCandidate[] {
  const { candidates, rules, totalFindingsCap } = args;
  const rulesByName = new Map(rules.map((r) => [r.name, r]));

  const sorted = [...candidates].sort((a, b) => {
    const ruleA = rulesByName.get(a.ruleName);
    const ruleB = rulesByName.get(b.ruleName);
    if (ruleA && ruleB) {
      const byRule = compareRulesByImpactRisk(ruleA, ruleB);
      if (byRule !== 0) return byRule;
    }
    const pathCmp = a.filePath.localeCompare(b.filePath);
    if (pathCmp !== 0) return pathCmp;
    return a.line - b.line;
  });

  const perRulePosted = new Map<string, number>();
  const capped: AuditCommentCandidate[] = [];

  for (const candidate of sorted) {
    const rule = rulesByName.get(candidate.ruleName);
    const limit = rule ? countRuleFindings(rule) : 0;
    if (limit <= 0) continue;

    const posted = perRulePosted.get(candidate.ruleName) ?? 0;
    if (posted >= limit) continue;

    perRulePosted.set(candidate.ruleName, posted + 1);
    capped.push(candidate);
  }

  if (
    totalFindingsCap != null &&
    totalFindingsCap > 0 &&
    capped.length > totalFindingsCap
  ) {
    return capped.slice(0, totalFindingsCap);
  }

  return capped;
}

export type FormatInlineCommentOptions = {
  portalServiceUrl?: string;
};

function formatSeverityRiskSection(args: {
  label: 'Severity' | 'Risk';
  score: string | undefined;
  statement: string | undefined;
}): string[] {
  const title = `### ${args.label}: \`${formatScoreLabel(args.score)}\``;
  const statement = args.statement?.trim();
  if (!statement) {
    return ['', title];
  }

  return ['', title, '', statement];
}

/** Removes a leading `## Description` heading and demotes other `##` headings to `####`. */
export function stripDescriptionHeading(description: string): string {
  const withoutDescription = description
    .trim()
    .replace(/^##\s+Description\s*\n*/i, '')
    .trim();
  return withoutDescription.replace(/(^|\n)## (?![#])/gm, '$1#### ');
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
    lines.push(descriptionBlock);
  }

  lines.push(
    ...formatSeverityRiskSection({
      label: 'Severity',
      score: candidate.impact,
      statement: candidate.impactStatement,
    }),
    ...formatSeverityRiskSection({
      label: 'Risk',
      score: candidate.risk,
      statement: candidate.riskStatement,
    })
  );

  return lines.join('\n').trimEnd();
}
