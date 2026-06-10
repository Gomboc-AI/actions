/**
 * Phase 2: inline PR review comments + summary; optional fail-on-findings.
 */
import fs from 'node:fs';
import { artifactPath } from './lib/artifacts.js';
import {
  loadBatchReportsWithWorkspace,
  publishAuditFeedback,
} from './lib/audit-feedback.js';
import { envBool, envInt, requireEnv } from './lib/env.js';
import { GitHubClient, parseOwnerRepo } from './lib/clients/github-client.js';
import { loadPullRequestContext } from './lib/github-context.js';
import { totalsFromBatchReports } from './lib/report-counts.js';
import { runMain } from './lib/runner.js';

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
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

  const { files: scannable } = loadJson<{ files: string[] }>(
    artifactPath('pr-scannable-files.json')
  );
  const workspace = requireEnv('GITHUB_WORKSPACE');
  const maxComments = envInt('INPUT_COMMENT_MAX_PER_PR', 50);
  const portalServiceUrl = (
    process.env.INPUT_PORTAL_SERVICE_URL?.trim() || 'https://app.gomboc.ai'
  ).replace(/\/+$/, '');

  const batchReports = loadBatchReportsWithWorkspace();
  const reportTotals = totalsFromBatchReports(batchReports);

  await publishAuditFeedback({
    github,
    owner,
    repo,
    pullNumber: pr.number,
    headSha: pr.headSha,
    baseSha: pr.baseSha,
    workspaceRoot: workspace,
    scannableFiles: scannable,
    portalServiceUrl,
    maxComments,
    summaryTarget: 'issue_comment',
  });

  const normalized = loadJson<{
    findings: number;
    fixes: number;
    changes: number;
  }>(artifactPath('normalized-report.json'));
  const totalFindings = Math.max(normalized.findings ?? 0, reportTotals.findings);
  const totalChanges = Math.max(normalized.changes ?? 0, reportTotals.changes);

  if (envBool('INPUT_FAIL_ON_FINDINGS', false)) {
    if (totalFindings > 0 || totalChanges > 0) {
      throw new Error(
        `fail-on-findings: policy violations detected (findings=${totalFindings}, changes=${totalChanges})`
      );
    }
  }
}

runMain(main);
