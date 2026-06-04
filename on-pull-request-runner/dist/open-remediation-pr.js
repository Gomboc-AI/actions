/**
 * Phase 3: apply ORL fixes to checkout and open a stacked remediation PR.
 */
import fs from 'node:fs';
import yaml from 'yaml';
import { applyOrlFixes } from './lib/apply-orl-fixes.js';
import { artifactPath } from './lib/artifacts.js';
import { gitAddAll, gitCheckoutBranch, gitCommit, gitPush, gitStatusPorcelain, } from './lib/git.js';
import { GitHubClient, parseOwnerRepo } from './lib/github-client.js';
import { loadPullRequestContext } from './lib/github-context.js';
import { requireEnv } from './lib/env.js';
import { totalsFromBatchReports } from './lib/report-counts.js';
import { runMain } from './lib/runner.js';
function loadBatches() {
    const raw = JSON.parse(fs.readFileSync(artifactPath('evaluation-batches.json'), 'utf8'));
    return raw.batches;
}
function loadBatchReports() {
    const batches = loadBatches();
    const out = [];
    for (const batch of batches) {
        const reportPath = artifactPath(`batches/${batch.batchId}/report.yaml`);
        if (!fs.existsSync(reportPath))
            continue;
        out.push({
            batchId: batch.batchId,
            report: yaml.parse(fs.readFileSync(reportPath, 'utf8')),
        });
    }
    return out;
}
function loadBatchReport(batchId) {
    const reportPath = artifactPath(`batches/${batchId}/report.yaml`);
    if (!fs.existsSync(reportPath))
        return null;
    return yaml.parse(fs.readFileSync(reportPath, 'utf8'));
}
function loadStagedFiles(batchId) {
    const manifestPath = artifactPath(`batches/${batchId}/staged-files.json`);
    if (!fs.existsSync(manifestPath))
        return null;
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return raw.files ?? null;
}
function remediationBranchName(prefix, pullNumber) {
    const trimmed = prefix.replace(/\/+$/, '').trim() || 'gomboc/orl-remediation';
    return `${trimmed}-${pullNumber}`;
}
async function findOpenRemediationPr(args) {
    const open = await args.github.listOpenPullRequests({
        owner: args.owner,
        repo: args.repo,
    });
    const match = open.find((pr) => pr.head.ref === args.headRef && pr.state === 'open');
    if (!match)
        return null;
    return {
        number: match.number,
        html_url: `https://github.com/${args.owner}/${args.repo}/pull/${match.number}`,
    };
}
async function main() {
    const mode = (process.env.INPUT_MODE ?? '').trim();
    if (mode !== 'remediate') {
        console.log(`Skipping remediation PR (mode=${mode || 'unset'})`);
        return;
    }
    const pr = loadPullRequestContext();
    if (pr.isFork) {
        console.warn(`Fork PR detected (head repo ${pr.headRepoFullName} != ${pr.repository}); skipping remediation push.`);
        return;
    }
    const workspaceRoot = requireEnv('GITHUB_WORKSPACE');
    const batchWorkRoot = artifactPath('orl-workspace');
    const batches = loadBatches();
    const batchReports = loadBatchReports();
    const reportTotals = totalsFromBatchReports(batchReports.map(({ report }) => ({ report })));
    const { copiedPaths, skippedUnchanged, skippedMissing } = applyOrlFixes({
        batchWorkRoot,
        workspaceRoot,
        batches,
        reportForBatch: loadBatchReport,
        stagedFilesForBatch: loadStagedFiles,
    });
    console.log(`ORL report totals: findings=${reportTotals.findings}, fixes=${reportTotals.fixes}, changes=${reportTotals.changes}`);
    if (copiedPaths.length) {
        console.log(`Applied ORL fixes for ${copiedPaths.length} path(s): ${copiedPaths.join(', ')}`);
    }
    else {
        console.log('No remediated files copied from batch workspaces');
        if (reportTotals.fixes === 0 && reportTotals.changes === 0) {
            console.log('ORL did not apply any fixes to the staged workspace (findings may remain). No remediation PR will be opened.');
        }
        if (skippedUnchanged.length) {
            console.log(`${skippedUnchanged.length} staged path(s) unchanged vs checkout: ${skippedUnchanged.slice(0, 10).join(', ')}${skippedUnchanged.length > 10 ? '…' : ''}`);
        }
        if (skippedMissing.length) {
            console.log(`${skippedMissing.length} candidate path(s) missing in batch workspace: ${skippedMissing.slice(0, 10).join(', ')}${skippedMissing.length > 10 ? '…' : ''}`);
        }
    }
    const status = gitStatusPorcelain(workspaceRoot);
    if (!status.trim()) {
        console.log('No ORL fixes to commit (working tree clean)');
        return;
    }
    const branchPrefix = process.env.INPUT_REMEDIATION_BRANCH_PREFIX?.trim() || 'gomboc/orl-remediation';
    const botBranch = remediationBranchName(branchPrefix, pr.number);
    const commitMessage = `chore(gomboc): ORL remediation for PR #${pr.number}`;
    gitCheckoutBranch(botBranch, workspaceRoot);
    gitAddAll(workspaceRoot);
    gitCommit(commitMessage, workspaceRoot);
    gitPush('origin', botBranch, workspaceRoot);
    console.log(`Pushed remediation branch ${botBranch}`);
    const { owner, repo } = parseOwnerRepo(pr.repository);
    const github = GitHubClient.fromEnv();
    const existing = await findOpenRemediationPr({
        github,
        owner,
        repo,
        headRef: botBranch,
    });
    if (existing) {
        console.log(`Updated existing remediation PR #${existing.number}: ${existing.html_url}`);
        return;
    }
    const created = await github.createPullRequest({
        owner,
        repo,
        title: commitMessage,
        head: botBranch,
        base: pr.headRef,
        body: [
            `Automated ORL remediation stacked on \`${pr.headRef}\` for PR #${pr.number}.`,
            '',
            'Review and merge this PR into your feature branch before merging the original PR.',
        ].join('\n'),
    });
    console.log(`Opened remediation PR #${created.number}: ${created.html_url}`);
}
runMain(main);
//# sourceMappingURL=open-remediation-pr.js.map