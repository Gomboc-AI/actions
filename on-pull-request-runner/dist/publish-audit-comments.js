/**
 * Phase 2: inline PR review comments + summary; optional fail-on-findings.
 */
import fs from 'node:fs';
import yaml from 'yaml';
import { artifactPath } from './lib/artifacts.js';
import { AUDIT_COMMENT_MARKER, extractAuditCommentCandidates, formatInlineCommentBody, } from './lib/extract-audit-comments.js';
import { envBool, envInt, requireEnv } from './lib/env.js';
import { formatSeverityRiskCell, ruleSeverityRisk, } from './lib/rule-metadata.js';
import { gitDiffChangedLines } from './lib/git-diff-lines.js';
import { GitHubClient, parseOwnerRepo } from './lib/github-client.js';
import { loadPullRequestContext } from './lib/github-context.js';
import { runMain } from './lib/runner.js';
function loadJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function loadBatchReports() {
    const { batches } = loadJson(artifactPath('evaluation-batches.json'));
    const out = [];
    for (const batch of batches) {
        const reportPath = artifactPath(`batches/${batch.batchId}/report.yaml`);
        if (!fs.existsSync(reportPath))
            continue;
        out.push({
            batchId: batch.batchId,
            workspacePath: batch.workspacePath,
            report: yaml.parse(fs.readFileSync(reportPath, 'utf8')),
        });
    }
    return out;
}
function loadBatchDiagnostics() {
    const { batches } = loadJson(artifactPath('evaluation-batches.json'));
    return batches.map((batch) => {
        const diagPath = artifactPath(`batches/${batch.batchId}/diagnostics.json`);
        if (!fs.existsSync(diagPath)) {
            return { batchId: batch.batchId, diagnostics: null };
        }
        return {
            batchId: batch.batchId,
            diagnostics: JSON.parse(fs.readFileSync(diagPath, 'utf8')),
        };
    });
}
function collectRulesWithFindings(batchReports) {
    const rules = [];
    for (const { report } of batchReports) {
        for (const rule of report.spec?.rules ?? []) {
            if ((rule.findings ?? 0) > 0)
                rules.push(rule);
        }
    }
    return rules;
}
function workflowRunUrl() {
    const server = process.env.GITHUB_SERVER_URL;
    const repository = process.env.GITHUB_REPOSITORY;
    const runId = process.env.GITHUB_RUN_ID;
    if (!server || !repository || !runId)
        return null;
    return `${server}/${repository}/actions/runs/${runId}`;
}
function buildDiffChangedLinesMap(args) {
    const map = new Map();
    for (const file of args.scannable) {
        const lines = gitDiffChangedLines({
            baseSha: args.baseSha,
            headSha: args.headSha,
            cwd: args.cwd,
            filePath: file,
        });
        if (lines.length)
            map.set(file, lines);
    }
    return map;
}
function formatSummaryBody(args) {
    const { findings, fixes, changes, posted, skipped, unanchored, rules, workflowUrl } = args;
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
    if (unanchored > 0) {
        lines.push('', `${unanchored} finding(s) had no resolvable line location in the ORL report.`);
    }
    if (skipped > 0) {
        lines.push('', `${skipped} inline comment(s) could not be posted on the PR diff (line outside diff hunk or GitHub rejected the anchor).`);
    }
    if (rules.length) {
        lines.push('', '### Rules with findings', '');
        lines.push('| Rule | Severity | Risk | Findings |');
        lines.push('|------|----------|------|----------|');
        for (const rule of rules) {
            const { severity, risk } = ruleSeverityRisk(rule);
            const name = rule.metadata?.display_name ?? rule.name;
            lines.push(`| ${name} | ${formatSeverityRiskCell(severity)} | ${formatSeverityRiskCell(risk)} | ${rule.findings ?? 0} |`);
        }
    }
    if (workflowUrl) {
        lines.push('', `Full reports are in the [\`gomboc-orl-report\`](${workflowUrl}) workflow artifact.`);
    }
    else {
        lines.push('', 'Full reports are in workflow artifacts (`gomboc-orl-report`).');
    }
    return lines.join('\n');
}
async function removePriorAuditComments(args) {
    const { github, owner, repo, pullNumber } = args;
    const reviewComments = await github.listPullReviewComments({
        owner,
        repo,
        pullNumber,
    });
    for (const c of reviewComments) {
        if (!c.body?.includes(AUDIT_COMMENT_MARKER))
            continue;
        await github.deletePullReviewComment({ owner, repo, commentId: c.id });
    }
}
async function postInlineComments(args) {
    const { github, owner, repo, pullNumber, headSha, candidates, maxComments } = args;
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
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`Skipped inline comment ${candidate.filePath}:${candidate.line} (${candidate.ruleName}): ${message}`);
            skipped++;
        }
    }
    return { posted, skipped };
}
async function upsertSummaryComment(args) {
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
async function main() {
    const mode = (process.env.INPUT_MODE ?? '').trim();
    if (mode !== 'audit') {
        console.log(`Skipping audit comments (mode=${mode || 'unset'})`);
        return;
    }
    const github = GitHubClient.fromEnv();
    const pr = loadPullRequestContext();
    const { owner, repo } = parseOwnerRepo(pr.repository);
    const normalized = loadJson(artifactPath('normalized-report.json'));
    const { files: scannable } = loadJson(artifactPath('pr-scannable-files.json'));
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
    const { batches } = loadJson(artifactPath('evaluation-batches.json'));
    const candidates = extractAuditCommentCandidates({
        batches,
        batchReports,
        batchDiagnostics,
        prScannableFiles,
        diffChangedLines,
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
        workflowUrl: workflowRunUrl(),
    });
    await upsertSummaryComment({
        github,
        owner,
        repo,
        issueNumber: pr.number,
        body: summaryBody,
    });
    console.log(`Audit comments: ${posted} inline posted, ${skipped} skipped, ${candidates.length} candidates`);
    if (envBool('INPUT_FAIL_ON_FINDINGS', false)) {
        const findings = normalized.findings ?? 0;
        const changes = normalized.changes ?? 0;
        if (findings > 0 || changes > 0) {
            throw new Error(`fail-on-findings: policy violations detected (findings=${findings}, changes=${changes})`);
        }
    }
}
runMain(main);
//# sourceMappingURL=publish-audit-comments.js.map