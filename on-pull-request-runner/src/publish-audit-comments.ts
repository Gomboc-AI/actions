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
  type AuditCommentCandidate,
  type DiagnosticsShape,
} from './lib/extract-audit-comments.js';
import { envBool, envInt } from './lib/env.js';
import { GitHubClient, parseOwnerRepo } from './lib/github-client.js';
import { loadPullRequestContext } from './lib/github-context.js';
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
      if ((rule.findings ?? 0) > 0) rules.push(rule);
    }
  }
  return rules;
}

function formatSummaryBody(args: {
  findings: number;
  fixes: number;
  changes: number;
  posted: number;
  skipped: number;
  unanchored: number;
  rules: OrlReportRule[];
}): string {
  const { findings, fixes, changes, posted, skipped, unanchored, rules } = args;
  const lines = [
    AUDIT_COMMENT_MARKER,
    '## Gomboc ORL audit summary',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| Findings | ${findings} |`,
    `| Fixes | ${fixes} |`,
    `| Changes | ${changes} |`,
    '',
    `Posted **${posted}** inline comment(s) on this PR.`,
  ];

  if (skipped > 0 || unanchored > 0) {
    lines.push(
      '',
      `${skipped + unanchored} finding(s) could not be placed on the PR diff (unchanged lines or outside the changed file set).`
    );
  }

  if (rules.length) {
    lines.push('', '### Rules with findings', '');
    lines.push('| Rule | Severity | Risk | Findings |');
    lines.push('|------|----------|------|----------|');
    for (const rule of rules) {
      const ann = rule.metadata?.annotations ?? {};
      const severity =
        ann.severity ?? ann['policy/severity'] ?? ann['gomboc.ai/severity'] ?? '—';
      const risk = ann.risk ?? ann['policy/risk'] ?? ann['gomboc.ai/risk'] ?? '—';
      const name = rule.metadata?.display_name ?? rule.name;
      lines.push(
        `| ${name} | ${severity} | ${risk} | ${rule.findings ?? 0} |`
      );
    }
  }

  lines.push(
    '',
    'Full reports are in workflow artifacts (`gomboc-orl-report`).'
  );
  return lines.join('\n');
}

async function removePriorAuditComments(args: {
  github: GitHubClient;
  owner: string;
  repo: string;
  pullNumber: number;
}): Promise<void> {
  const { github, owner, repo, pullNumber } = args;

  const reviewComments = await github.listPullReviewComments({
    owner,
    repo,
    pullNumber,
  });
  for (const c of reviewComments) {
    if (!c.body?.includes(AUDIT_COMMENT_MARKER)) continue;
    await github.deletePullReviewComment({ owner, repo, commentId: c.id });
  }
}

async function postInlineComments(args: {
  github: GitHubClient;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  candidates: AuditCommentCandidate[];
  maxComments: number;
}): Promise<{ posted: number; skipped: number }> {
  const { github, owner, repo, pullNumber, headSha, candidates, maxComments } =
    args;
  let posted = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    if (posted >= maxComments) {
      skipped += candidates.length - posted - skipped;
      break;
    }

    try {
      await github.createPullReviewComment({
        owner,
        repo,
        pullNumber,
        commitId: headSha,
        path: candidate.filePath,
        line: candidate.line,
        startLine: candidate.startLine,
        body: formatInlineCommentBody(candidate),
      });
      posted++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `Skipped inline comment ${candidate.filePath}:${candidate.line} (${candidate.ruleName}): ${message}`
      );
      skipped++;
    }
  }

  return { posted, skipped };
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
  });

  const maxComments = envInt('INPUT_COMMENT_MAX_PER_PR', 50);
  const totalFindings = normalized.findings ?? 0;
  const unanchored = Math.max(0, totalFindings - candidates.length);

  await removePriorAuditComments({
    github,
    owner,
    repo,
    pullNumber: pr.number,
  });

  const { posted, skipped } = await postInlineComments({
    github,
    owner,
    repo,
    pullNumber: pr.number,
    headSha: pr.headSha,
    candidates,
    maxComments,
  });

  const summaryBody = formatSummaryBody({
    findings: normalized.findings ?? 0,
    fixes: normalized.fixes ?? 0,
    changes: normalized.changes ?? 0,
    posted,
    skipped,
    unanchored,
    rules: collectRulesWithFindings(batchReports),
  });

  await upsertSummaryComment({
    github,
    owner,
    repo,
    issueNumber: pr.number,
    body: summaryBody,
  });

  console.log(
    `Audit comments: ${posted} inline posted, ${skipped} skipped, ${candidates.length} candidates`
  );

  if (envBool('INPUT_FAIL_ON_FINDINGS', false)) {
    const findings = normalized.findings ?? 0;
    const changes = normalized.changes ?? 0;
    if (findings > 0 || changes > 0) {
      throw new Error(
        `fail-on-findings: policy violations detected (findings=${findings}, changes=${changes})`
      );
    }
  }
}

runMain(main);
