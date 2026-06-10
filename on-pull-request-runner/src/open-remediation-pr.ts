/**
 * Phase 3: apply ORL fixes to checkout and open a stacked remediation PR.
 */
import fs from 'node:fs';
import yaml from 'yaml';
import { publishAuditFeedback } from './lib/audit-feedback.js';
import { applyOrlFixes } from './lib/apply-orl-fixes.js';
import { artifactPath } from './lib/artifacts.js';
import { envInt } from './lib/env.js';
import {
  configureGitIdentity,
  gitAddAll,
  gitCheckoutBranch,
  gitCommit,
  gitDiffNameOnly,
  gitPush,
  gitRevParse,
  gitStatusPorcelain,
} from './lib/git.js';
import { GitHubClient, parseOwnerRepo } from './lib/clients/github-client.js';
import { loadPullRequestContext } from './lib/github-context.js';
import { requireEnv } from './lib/env.js';
import { totalsFromBatchReports } from './lib/report-counts.js';
import { runMain } from './lib/runner.js';
import type { EvaluationBatch, OrlReport } from './types.js';

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function loadBatches(): EvaluationBatch[] {
  const raw = loadJson<{ batches: EvaluationBatch[] }>(
    artifactPath('evaluation-batches.json')
  );
  return raw.batches;
}

function loadBatchReports(): Array<{ batchId: string; report: OrlReport }> {
  const batches = loadBatches();
  const out: Array<{ batchId: string; report: OrlReport }> = [];
  for (const batch of batches) {
    const reportPath = artifactPath(`batches/${batch.batchId}/report.yaml`);
    if (!fs.existsSync(reportPath)) continue;
    out.push({
      batchId: batch.batchId,
      report: yaml.parse(fs.readFileSync(reportPath, 'utf8')) as OrlReport,
    });
  }
  return out;
}

function loadBatchReport(batchId: string): OrlReport | null {
  const reportPath = artifactPath(`batches/${batchId}/report.yaml`);
  if (!fs.existsSync(reportPath)) return null;
  return yaml.parse(fs.readFileSync(reportPath, 'utf8')) as OrlReport;
}

function loadStagedFiles(batchId: string): string[] | null {
  const manifestPath = artifactPath(`batches/${batchId}/staged-files.json`);
  if (!fs.existsSync(manifestPath)) return null;
  const raw = loadJson<{ files?: string[] }>(manifestPath);
  return raw.files ?? null;
}

function remediationBranchName(prefix: string, pullNumber: number): string {
  const trimmed = prefix.replace(/\/+$/, '').trim() || 'gomboc/orl-remediation';
  return `${trimmed}-${pullNumber}`;
}

async function findOpenRemediationPr(args: {
  github: GitHubClient;
  owner: string;
  repo: string;
  headRef: string;
}): Promise<{ number: number; html_url: string } | null> {
  const open = await args.github.listOpenPullRequests({
    owner: args.owner,
    repo: args.repo,
  });
  const match = open.find((pr) => pr.head.ref === args.headRef && pr.state === 'open');
  if (!match) return null;
  return {
    number: match.number,
    html_url: `https://github.com/${args.owner}/${args.repo}/pull/${match.number}`,
  };
}

function remediationScannableFiles(args: {
  copiedPaths: string[];
  workspaceRoot: string;
  baseSha: string;
  headSha: string;
}): string[] {
  const fromDiff = gitDiffNameOnly({
    baseSha: args.baseSha,
    headSha: args.headSha,
    cwd: args.workspaceRoot,
  });
  return [...new Set([...args.copiedPaths, ...fromDiff])].sort();
}

async function publishRemediationFeedback(args: {
  github: GitHubClient;
  owner: string;
  repo: string;
  remediationPullNumber: number;
  workspaceRoot: string;
  baseSha: string;
  headSha: string;
  scannableFiles: string[];
  sourcePullNumber: number;
  sourceHeadRef: string;
}): Promise<void> {
  const portalServiceUrl = (
    process.env.INPUT_PORTAL_SERVICE_URL?.trim() || 'https://app.gomboc.ai'
  ).replace(/\/+$/, '');
  const maxComments = envInt('INPUT_COMMENT_MAX_PER_PR', 50);

  await publishAuditFeedback({
    github: args.github,
    owner: args.owner,
    repo: args.repo,
    pullNumber: args.remediationPullNumber,
    headSha: args.headSha,
    baseSha: args.baseSha,
    workspaceRoot: args.workspaceRoot,
    scannableFiles: args.scannableFiles,
    portalServiceUrl,
    maxComments,
    summaryTarget: 'pull_body',
    introLines: [
      `Automated ORL remediation stacked on \`${args.sourceHeadRef}\` for PR #${args.sourcePullNumber}.`,
      '',
      'Review and merge this PR into your feature branch before merging the original PR.',
    ],
  });
}

async function main(): Promise<void> {
  const mode = (process.env.INPUT_MODE ?? '').trim();
  if (mode !== 'remediate') {
    console.log(`Skipping remediation PR (mode=${mode || 'unset'})`);
    return;
  }

  const pr = loadPullRequestContext();
  if (pr.isFork) {
    console.warn(
      `Fork PR detected (head repo ${pr.headRepoFullName} != ${pr.repository}); skipping remediation push.`
    );
    return;
  }

  const workspaceRoot = requireEnv('GITHUB_WORKSPACE');
  const batchWorkRoot = artifactPath('orl-workspace');
  const batches = loadBatches();
  const batchReports = loadBatchReports();
  const reportTotals = totalsFromBatchReports(
    batchReports.map(({ report }) => ({ report }))
  );

  const { copiedPaths, skippedUnchanged, skippedMissing } = applyOrlFixes({
    batchWorkRoot,
    workspaceRoot,
    batches,
    reportForBatch: loadBatchReport,
    stagedFilesForBatch: loadStagedFiles,
  });

  console.log(
    `ORL report totals: findings=${reportTotals.findings}, fixes=${reportTotals.fixes}, changes=${reportTotals.changes}`
  );

  if (copiedPaths.length) {
    console.log(`Applied ORL fixes for ${copiedPaths.length} path(s): ${copiedPaths.join(', ')}`);
  } else {
    console.log('No remediated files copied from batch workspaces');
    if (reportTotals.fixes === 0 && reportTotals.changes === 0) {
      console.log(
        'ORL did not apply any fixes to the staged workspace (findings may remain). No remediation PR will be opened.'
      );
    }
    if (skippedUnchanged.length) {
      console.log(
        `${skippedUnchanged.length} staged path(s) unchanged vs checkout: ${skippedUnchanged.slice(0, 10).join(', ')}${skippedUnchanged.length > 10 ? '…' : ''}`
      );
    }
    if (skippedMissing.length) {
      console.log(
        `${skippedMissing.length} candidate path(s) missing in batch workspace: ${skippedMissing.slice(0, 10).join(', ')}${skippedMissing.length > 10 ? '…' : ''}`
      );
    }
  }

  const status = gitStatusPorcelain(workspaceRoot);
  if (!status.trim()) {
    console.log('No ORL fixes to commit (working tree clean)');
    return;
  }

  const branchPrefix =
    process.env.INPUT_REMEDIATION_BRANCH_PREFIX?.trim() || 'gomboc/orl-remediation';
  const botBranch = remediationBranchName(branchPrefix, pr.number);
  const commitMessage = `chore(gomboc): ORL remediation for PR #${pr.number}`;

  gitCheckoutBranch(botBranch, workspaceRoot);
  configureGitIdentity(workspaceRoot);
  gitAddAll(workspaceRoot);
  gitCommit(commitMessage, workspaceRoot);
  gitPush('origin', botBranch, workspaceRoot);
  console.log(`Pushed remediation branch ${botBranch}`);

  const headSha = gitRevParse('HEAD', workspaceRoot);
  const baseSha = gitRevParse('HEAD~1', workspaceRoot);
  const scannableFiles = remediationScannableFiles({
    copiedPaths,
    workspaceRoot,
    baseSha,
    headSha,
  });

  const { owner, repo } = parseOwnerRepo(pr.repository);
  const github = GitHubClient.fromEnv();

  const existing = await findOpenRemediationPr({
    github,
    owner,
    repo,
    headRef: botBranch,
  });

  let remediationPullNumber: number;
  let remediationUrl: string;

  if (existing) {
    remediationPullNumber = existing.number;
    remediationUrl = existing.html_url;
    console.log(`Updated existing remediation PR #${remediationPullNumber}: ${remediationUrl}`);
  } else {
    const placeholderBody = [
      `Automated ORL remediation stacked on \`${pr.headRef}\` for PR #${pr.number}.`,
      '',
      '_Assessment summary loading…_',
    ].join('\n');

    const created = await github.createPullRequest({
      owner,
      repo,
      title: commitMessage,
      head: botBranch,
      base: pr.headRef,
      body: placeholderBody,
    });
    remediationPullNumber = created.number;
    remediationUrl = created.html_url;
    console.log(`Opened remediation PR #${remediationPullNumber}: ${remediationUrl}`);
  }

  if (pr.authorLogin) {
    try {
      await github.assignIssueAssignees({
        owner,
        repo,
        issueNumber: remediationPullNumber,
        assignees: [pr.authorLogin],
      });
      console.log(`Assigned remediation PR #${remediationPullNumber} to @${pr.authorLogin}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `Could not assign remediation PR #${remediationPullNumber} to @${pr.authorLogin}: ${message}`
      );
    }
  }

  await publishRemediationFeedback({
    github,
    owner,
    repo,
    remediationPullNumber,
    workspaceRoot,
    baseSha,
    headSha,
    scannableFiles,
    sourcePullNumber: pr.number,
    sourceHeadRef: pr.headRef,
  });
}

runMain(main);
