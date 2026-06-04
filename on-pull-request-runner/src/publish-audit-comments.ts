/**
 * Phase 2: inline PR review comments + summary; optional fail-on-findings.
 */
import fs from 'node:fs';
import yaml from 'yaml';
import { artifactPath } from './lib/artifacts.js';
import {
  AUDIT_COMMENT_MARKER,
  extractAuditCommentCandidates,
  formatInlineCommentBody,
  isAuditCommentBody,
  parseAuditCommentDedupeKey,
  type AuditCommentCandidate,
  type DiagnosticsShape,
} from './lib/extract-audit-comments.js';
import { envBool, envInt, requireEnv } from './lib/env.js';
import {
  formatScoreCell,
  ruleImpactRisk,
} from './lib/rule-metadata.js';
import { gitDiffChangedLines } from './lib/git-diff-lines.js';
import { GitHubClient, parseOwnerRepo } from './lib/github-client.js';
import { loadPullRequestContext } from './lib/github-context.js';
import {
  countRuleFindings,
  totalsFromBatchReports,
  totalsFromReport,
} from './lib/report-counts.js';
import {
  formatActionNoticesSection,
  hasAuthFailureNotices,
  hasErrorNotices,
  loadActionNotices,
  type ActionNotice,
} from './lib/action-notices.js';
import { runMain } from './lib/runner.js';
import type { EvaluationBatch, OrlReport, OrlReportRule } from './types.js';

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function loadBatchReports(): Array<{
  batchId: string;
  workspacePath: string;
  report: OrlReport;
}> {
  const { batches } = loadJson<{ batches: EvaluationBatch[] }>(
    artifactPath('evaluation-batches.json')
  );
  const out: Array<{ batchId: string; workspacePath: string; report: OrlReport }> =
    [];

  for (const batch of batches) {
    const reportPath = artifactPath(`batches/${batch.batchId}/report.yaml`);
    if (!fs.existsSync(reportPath)) continue;
    out.push({
      batchId: batch.batchId,
      workspacePath: batch.workspacePath,
      report: yaml.parse(fs.readFileSync(reportPath, 'utf8')) as OrlReport,
    });
  }
  return out;
}

function loadBatchDiagnostics(): Array<{
  batchId: string;
  diagnostics: DiagnosticsShape | null;
}> {
  const { batches } = loadJson<{ batches: EvaluationBatch[] }>(
    artifactPath('evaluation-batches.json')
  );
  return batches.map((batch) => {
    const diagPath = artifactPath(`batches/${batch.batchId}/diagnostics.json`);
    if (!fs.existsSync(diagPath)) {
      return { batchId: batch.batchId, diagnostics: null };
    }
    return {
      batchId: batch.batchId,
      diagnostics: JSON.parse(
        fs.readFileSync(diagPath, 'utf8')
      ) as DiagnosticsShape,
    };
  });
}

function collectRulesWithFindings(
  batchReports: Array<{ report: OrlReport }>
): OrlReportRule[] {
  const rules: OrlReportRule[] = [];
  for (const { report } of batchReports) {
    for (const rule of report.spec?.rules ?? []) {
      if (countRuleFindings(rule) > 0) rules.push(rule);
    }
  }
  return rules;
}

function workflowRunUrl(): string | null {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!server || !repository || !runId) return null;
  return `${server}/${repository}/actions/runs/${runId}`;
}

function buildDiffChangedLinesMap(args: {
  scannable: string[];
  baseSha: string;
  headSha: string;
  cwd: string;
}): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const file of args.scannable) {
    const lines = gitDiffChangedLines({
      baseSha: args.baseSha,
      headSha: args.headSha,
      cwd: args.cwd,
      filePath: file,
    });
    if (lines.length) map.set(file, lines);
  }
  return map;
}

function formatSummaryBody(args: {
  findings: number;
  fixes: number;
  changes: number;
  posted: number;
  skipped: number;
  unanchored: number;
  candidates: number;
  batchesEvaluated: number;
  rules: OrlReportRule[];
  workflowUrl: string | null;
  notices: ActionNotice[];
}): string {
  const {
    findings,
    fixes,
    changes,
    posted,
    skipped,
    unanchored,
    candidates,
    batchesEvaluated,
    rules,
    workflowUrl,
    notices,
  } = args;

  const lines = [AUDIT_COMMENT_MARKER, '## Gomboc Assessment Results', ''];

  lines.push(...formatActionNoticesSection(notices));

  const suppressMetrics = hasErrorNotices(notices) || hasAuthFailureNotices(notices);

  if (!suppressMetrics) {
    lines.push(
      '| Metric | Count |',
      '|--------|-------|',
      `| Findings | ${findings} |`,
      `| Fixes | ${fixes} |`,
      `| Changes | ${changes} |`,
      '',
      `Posted **${posted}** inline comment(s) on this PR.`
    );
  } else {
    lines.push(
      'The assessment did not complete successfully, so finding counts are not available.',
      ''
    );
    if (posted > 0) {
      lines.push(`Posted **${posted}** inline comment(s) on this PR.`, '');
    }
  }

  if (!suppressMetrics) {
    if (unanchored > 0) {
      lines.push(
        '',
        `${unanchored} finding(s) had no resolvable line location in the assessment report.`
      );
    }
    if (findings > 0 && candidates === 0) {
      lines.push(
        '',
        'Findings were reported but none could be anchored on changed lines in this PR.'
      );
    }
    if (skipped > 0) {
      lines.push(
        '',
        `${skipped} inline comment(s) could not be posted on the PR diff (line outside diff hunk or GitHub rejected the anchor).`
      );
    }
    if (posted === 0 && findings > 0 && candidates > 0 && skipped === 0) {
      lines.push('', 'No inline comments were posted despite resolvable finding anchors.');
    }
    if (batchesEvaluated === 0) {
      lines.push('', 'No evaluation batches ran; prior inline comments were left unchanged.');
    }
  }

  if (!suppressMetrics && rules.length) {
    lines.push('', '### Rules with findings', '');
    lines.push('| Rule | Impact | Risk | Findings |');
    lines.push('|------|--------|------|----------|');
    for (const rule of rules) {
      const { impact, risk } = ruleImpactRisk(rule);
      const name = rule.metadata?.display_name ?? rule.name;
      lines.push(
        `| ${name} | ${formatScoreCell(impact)} | ${formatScoreCell(risk)} | ${countRuleFindings(rule)} |`
      );
    }
  }

  if (workflowUrl) {
    lines.push(
      '',
      `Full reports are in the [\`gomboc-orl-report\`](${workflowUrl}) workflow artifact.`
    );
  } else {
    lines.push('', 'Full reports are in workflow artifacts (`gomboc-orl-report`).');
  }
  return lines.join('\n');
}

async function pruneStaleAuditComments(args: {
  github: GitHubClient;
  owner: string;
  repo: string;
  pullNumber: number;
  postedCommentIds: Set<number>;
  activeDedupeKeys: Set<string>;
  totalFindings: number;
  scanCompleted: boolean;
}): Promise<number> {
  const {
    github,
    owner,
    repo,
    pullNumber,
    postedCommentIds,
    activeDedupeKeys,
    totalFindings,
    scanCompleted,
  } = args;

  const reviewComments = await github.listPullReviewComments({
    owner,
    repo,
    pullNumber,
  });

  let removed = 0;
  for (const comment of reviewComments) {
    const body = comment.body ?? '';
    if (!isAuditCommentBody(body)) continue;
    if (postedCommentIds.has(comment.id)) continue;

    const key = parseAuditCommentDedupeKey(body);
    let shouldRemove = false;

    if (key && activeDedupeKeys.has(key)) {
      shouldRemove = true;
    } else if (activeDedupeKeys.size > 0) {
      shouldRemove = true;
    } else if (totalFindings === 0 && scanCompleted) {
      shouldRemove = true;
    }

    if (!shouldRemove) continue;

    await github.deletePullReviewComment({
      owner,
      repo,
      commentId: comment.id,
    });
    removed++;
  }

  return removed;
}

async function postInlineComments(args: {
  github: GitHubClient;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  candidates: AuditCommentCandidate[];
  maxComments: number;
  portalServiceUrl: string;
}): Promise<{
  posted: number;
  skipped: number;
  postedCommentIds: Set<number>;
  activeDedupeKeys: Set<string>;
}> {
  const {
    github,
    owner,
    repo,
    pullNumber,
    headSha,
    candidates,
    maxComments,
    portalServiceUrl,
  } = args;
  let posted = 0;
  let skipped = 0;
  const postedCommentIds = new Set<number>();
  const activeDedupeKeys = new Set<string>();

  for (const candidate of candidates) {
    if (posted >= maxComments) {
      skipped += candidates.length - posted - skipped;
      break;
    }

    try {
      const created = await github.createPullReviewComment({
        owner,
        repo,
        pullNumber,
        commitId: headSha,
        path: candidate.filePath,
        line: candidate.line,
        startLine: candidate.startLine,
        body: formatInlineCommentBody(candidate, { portalServiceUrl }),
      });
      postedCommentIds.add(created.id);
      activeDedupeKeys.add(candidate.dedupeKey);
      posted++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `Skipped inline comment ${candidate.filePath}:${candidate.line} (${candidate.ruleName}): ${message}`
      );
      skipped++;
    }
  }

  return { posted, skipped, postedCommentIds, activeDedupeKeys };
}

async function upsertSummaryComment(args: {
  github: GitHubClient;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}): Promise<void> {
  const { github, owner, repo, issueNumber, body } = args;
  const existing = await github.listIssueComments({ owner, repo, issueNumber });
  const prior = existing.find((c) => c.body?.includes(AUDIT_COMMENT_MARKER));

  if (prior) {
    await github.updateIssueComment({
      owner,
      repo,
      commentId: prior.id,
      body,
    });
    return;
  }

  await github.postIssueComment({ owner, repo, issueNumber, body });
}

async function main(): Promise<void> {
  const mode = (process.env.INPUT_MODE ?? '').trim();
  if (mode !== 'audit') {
    console.log(`Skipping audit comments (mode=${mode || 'unset'})`);
    return;
  }

  const github = GitHubClient.fromEnv();
  const pr = loadPullRequestContext();
  const { owner, repo } = parseOwnerRepo(pr.repository);

  const normalized = loadJson<{
    findings: number;
    fixes: number;
    changes: number;
  }>(artifactPath('normalized-report.json'));

  const { files: scannable } = loadJson<{ files: string[] }>(
    artifactPath('pr-scannable-files.json')
  );
  const prScannableFiles = new Set(scannable);
  const workspace = requireEnv('GITHUB_WORKSPACE');
  const diffChangedLines = buildDiffChangedLinesMap({
    scannable,
    baseSha: pr.baseSha,
    headSha: pr.headSha,
    cwd: workspace,
  });

  const batchReports = loadBatchReports();
  const batchDiagnostics = loadBatchDiagnostics();
  const { batches } = loadJson<{ batches: EvaluationBatch[] }>(
    artifactPath('evaluation-batches.json')
  );

  const candidates = extractAuditCommentCandidates({
    batches,
    batchReports,
    batchDiagnostics,
    prScannableFiles,
    diffChangedLines,
  });

  const maxComments = envInt('INPUT_COMMENT_MAX_PER_PR', 50);
  const portalServiceUrl = (
    process.env.INPUT_PORTAL_SERVICE_URL?.trim() || 'https://app.gomboc.ai'
  ).replace(/\/+$/, '');
  const reportTotals = totalsFromBatchReports(batchReports);
  const totalFindings = Math.max(normalized.findings ?? 0, reportTotals.findings);
  const totalFixes = Math.max(normalized.fixes ?? 0, reportTotals.fixes);
  const totalChanges = Math.max(normalized.changes ?? 0, reportTotals.changes);
  const unanchored = Math.max(0, totalFindings - candidates.length);
  const scanCompleted = batchReports.length > 0;

  for (const { batchId, report } of batchReports) {
    const batchTotals = totalsFromReport(report);
    console.log(
      `Batch ${batchId}: spec.findings=${report.spec?.findings ?? 0}, computed.findings=${batchTotals.findings}, rules=${report.spec?.rules?.length ?? 0}, rules_applied=${report.spec?.rules_applied ?? 0}`
    );
    for (const rule of report.spec?.rules ?? []) {
      const n = countRuleFindings(rule);
      if (n <= 0) continue;
      console.log(
        `  ${rule.name}: findings=${n}, finding_locations=${rule.finding_locations?.length ?? 0}, paths=${Object.keys(rule.paths_with_findings ?? {}).length}`
      );
    }
  }
  console.log(
    `Inline comment planning: normalized.findings=${normalized.findings ?? 0}, report.findings=${reportTotals.findings}, candidates=${candidates.length}, scannable=${scannable.length}`
  );

  const { posted, skipped, postedCommentIds, activeDedupeKeys } =
    await postInlineComments({
      github,
      owner,
      repo,
      pullNumber: pr.number,
      headSha: pr.headSha,
      candidates,
      maxComments,
      portalServiceUrl,
    });

  const removed = await pruneStaleAuditComments({
    github,
    owner,
    repo,
    pullNumber: pr.number,
    postedCommentIds,
    activeDedupeKeys,
    totalFindings,
    scanCompleted,
  });

  const summaryBody = formatSummaryBody({
    findings: totalFindings,
    fixes: totalFixes,
    changes: totalChanges,
    posted,
    skipped,
    unanchored,
    candidates: candidates.length,
    batchesEvaluated: batchReports.length,
    rules: collectRulesWithFindings(batchReports),
    workflowUrl: workflowRunUrl(),
    notices: loadActionNotices(),
  });

  await upsertSummaryComment({
    github,
    owner,
    repo,
    issueNumber: pr.number,
    body: summaryBody,
  });

  console.log(
    `Audit comments: ${posted} inline posted, ${skipped} skipped, ${removed} stale removed, ${candidates.length} candidates`
  );

  if (envBool('INPUT_FAIL_ON_FINDINGS', false)) {
    if (totalFindings > 0 || totalChanges > 0) {
      throw new Error(
        `fail-on-findings: policy violations detected (findings=${totalFindings}, changes=${totalChanges})`
      );
    }
  }
}

runMain(main);
