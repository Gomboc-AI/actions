/**
 * Shared audit summary + inline review comment publishing for audit and remediate PRs.
 */
import fs from 'node:fs';
import yaml from 'yaml';
import { artifactPath } from './artifacts.js';
import { AUDIT_COMMENT_MARKER, capAuditCommentCandidates, extractAuditCommentCandidates, formatInlineCommentBody, isAuditCommentBody, parseAuditCommentDedupeKey, } from './extract-audit-comments.js';
import { gitDiffChangedLines } from './git-diff-lines.js';
import { formatScoreMarkdown, ruleImpactRisk, sortRulesByImpactRisk, } from './rule-metadata.js';
import { formatRuleDisplayLink } from './portal-url.js';
import { countRuleFindings, totalsFromBatchReports, } from './report-counts.js';
import { formatActionNoticesSection, hasAuthFailureNotices, hasErrorNotices, loadActionNotices, } from './action-notices.js';
function loadJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function loadBatchReportsWithWorkspace() {
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
            if (countRuleFindings(rule) > 0)
                rules.push(rule);
        }
    }
    return sortRulesByImpactRisk(rules);
}
export function workflowRunUrl() {
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
export function formatAuditSummaryBody(args) {
    const { findings, fixes, changes, posted, skipped, unanchored, candidates, batchesEvaluated, rules, workflowUrl, portalServiceUrl, notices, introLines, } = args;
    const lines = [AUDIT_COMMENT_MARKER, '## Gomboc Assessment Results', ''];
    if (introLines?.length) {
        lines.push(...introLines, '');
    }
    lines.push(...formatActionNoticesSection(notices));
    const suppressMetrics = hasErrorNotices(notices) || hasAuthFailureNotices(notices);
    if (!suppressMetrics) {
        lines.push('| Metric | Count |', '|--------|-------|', `| Findings | ${findings} |`, `| Fixes | ${fixes} |`, `| Changes | ${changes} |`, '', `Posted **${posted}** inline comment(s) on this PR.`);
    }
    else {
        lines.push('The assessment did not complete successfully, so finding counts are not available.', '');
        if (posted > 0) {
            lines.push(`Posted **${posted}** inline comment(s) on this PR.`, '');
        }
    }
    if (!suppressMetrics) {
        if (unanchored > 0) {
            lines.push('', `${unanchored} finding(s) had no resolvable line location in the assessment report.`);
        }
        if (findings > 0 && candidates === 0) {
            lines.push('', 'Findings were reported but none could be anchored on changed lines in this PR.');
        }
        if (skipped > 0) {
            lines.push('', `${skipped} inline comment(s) could not be posted on the PR diff (line outside diff hunk or GitHub rejected the anchor).`);
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
            const name = formatRuleDisplayLink({
                displayName: rule.metadata?.display_name ?? rule.name,
                ruleName: rule.name,
                portalBaseUrl: portalServiceUrl,
            });
            lines.push(`| ${name} | ${formatScoreMarkdown(impact)} | ${formatScoreMarkdown(risk)} | ${countRuleFindings(rule)} |`);
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
async function pruneStaleAuditComments(args) {
    const { github, owner, repo, pullNumber, postedCommentIds, activeDedupeKeys, totalFindings, scanCompleted, } = args;
    const reviewComments = await github.listPullReviewComments({
        owner,
        repo,
        pullNumber,
    });
    let removed = 0;
    for (const comment of reviewComments) {
        const body = comment.body ?? '';
        if (!isAuditCommentBody(body))
            continue;
        if (postedCommentIds.has(comment.id))
            continue;
        const key = parseAuditCommentDedupeKey(body);
        let shouldRemove = false;
        if (key && activeDedupeKeys.has(key)) {
            shouldRemove = true;
        }
        else if (totalFindings === 0 && scanCompleted) {
            shouldRemove = true;
        }
        if (!shouldRemove)
            continue;
        await github.deletePullReviewComment({
            owner,
            repo,
            commentId: comment.id,
        });
        removed++;
    }
    return removed;
}
async function postInlineComments(args) {
    const { github, owner, repo, pullNumber, headSha, candidates, maxComments, portalServiceUrl, commentableLinesByFile, } = args;
    let posted = 0;
    let skipped = 0;
    const postedCommentIds = new Set();
    const activeDedupeKeys = new Set();
    const usedLinesByFile = new Map();
    for (const candidate of candidates) {
        if (posted >= maxComments) {
            skipped += candidates.length - posted - skipped;
            break;
        }
        const fileLines = commentableLinesByFile?.get(candidate.filePath) ?? [];
        const usedOnFile = usedLinesByFile.get(candidate.filePath) ?? new Set();
        const unusedFileLines = fileLines.filter((line) => !usedOnFile.has(line));
        const lineCandidates = [
            candidate.line,
            ...unusedFileLines.filter((line) => line !== candidate.line),
            ...fileLines.filter((line) => line !== candidate.line && !unusedFileLines.includes(line)),
        ];
        const uniqueLines = [...new Set(lineCandidates.filter((line) => line > 0))];
        let createdId = null;
        let postedLine = null;
        for (const line of uniqueLines) {
            if (usedOnFile.has(line) && uniqueLines.length > 1)
                continue;
            try {
                const created = await github.createPullReviewComment({
                    owner,
                    repo,
                    pullNumber,
                    commitId: headSha,
                    path: candidate.filePath,
                    line,
                    startLine: line,
                    body: formatInlineCommentBody({ ...candidate, line, startLine: line }, { portalServiceUrl }),
                });
                createdId = created.id;
                postedLine = line;
                break;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`Skipped inline comment ${candidate.filePath}:${line} (${candidate.ruleName}): ${message}`);
            }
        }
        if (createdId == null || postedLine == null) {
            skipped++;
            continue;
        }
        postedCommentIds.add(createdId);
        activeDedupeKeys.add(candidate.dedupeKey);
        usedOnFile.add(postedLine);
        usedLinesByFile.set(candidate.filePath, usedOnFile);
        posted++;
    }
    return { posted, skipped, postedCommentIds, activeDedupeKeys };
}
async function upsertSummaryIssueComment(args) {
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
/** Posts inline review comments and audit-style summary on a pull request. */
export async function publishAuditFeedback(args) {
    const { github, owner, repo, pullNumber, headSha, baseSha, workspaceRoot, scannableFiles, portalServiceUrl, maxComments, summaryTarget, introLines, } = args;
    const normalized = loadJson(artifactPath('normalized-report.json'));
    const prScannableFiles = new Set(scannableFiles);
    const diffChangedLines = buildDiffChangedLinesMap({
        scannable: scannableFiles,
        baseSha,
        headSha,
        cwd: workspaceRoot,
    });
    const batchReports = loadBatchReportsWithWorkspace();
    const batchDiagnostics = loadBatchDiagnostics();
    const { batches } = loadJson(artifactPath('evaluation-batches.json'));
    const candidatesRaw = extractAuditCommentCandidates({
        batches,
        batchReports,
        batchDiagnostics,
        prScannableFiles,
        diffChangedLines,
        anchorStrategy: summaryTarget === 'pull_body' ? 'remediation' : 'audit',
    });
    const reportTotals = totalsFromBatchReports(batchReports);
    const totalFindings = Math.max(normalized.findings ?? 0, reportTotals.findings);
    const totalFixes = Math.max(normalized.fixes ?? 0, reportTotals.fixes);
    const totalChanges = Math.max(normalized.changes ?? 0, reportTotals.changes);
    const allRules = batchReports.flatMap(({ report }) => report.spec?.rules ?? []);
    const candidates = capAuditCommentCandidates({
        candidates: candidatesRaw,
        rules: allRules,
        totalFindingsCap: totalFindings,
    });
    if (candidatesRaw.length !== candidates.length) {
        console.log(`Capped inline comment candidates from ${candidatesRaw.length} to ${candidates.length} (report findings=${totalFindings})`);
    }
    const unanchored = Math.max(0, totalFindings - candidates.length);
    const scanCompleted = batchReports.length > 0;
    const isRemediation = summaryTarget === 'pull_body';
    if (isRemediation) {
        for (const [file, lines] of diffChangedLines) {
            console.log(`Remediation diff lines for ${file}: ${lines.length} commentable line(s)`);
        }
        const assignedLines = candidates.reduce((acc, c) => {
            const key = c.filePath;
            acc.set(key, (acc.get(key) ?? 0) + 1);
            return acc;
        }, new Map());
        for (const [file, count] of assignedLines) {
            console.log(`Remediation comment plan: ${count} comment(s) on ${file}`);
        }
    }
    console.log(`Inline comment planning: findings=${totalFindings}, candidates=${candidates.length}, scannable=${scannableFiles.length}`);
    const { posted, skipped, postedCommentIds, activeDedupeKeys } = await postInlineComments({
        github,
        owner,
        repo,
        pullNumber,
        headSha,
        candidates,
        maxComments,
        portalServiceUrl,
        commentableLinesByFile: isRemediation ? diffChangedLines : undefined,
    });
    const removed = await pruneStaleAuditComments({
        github,
        owner,
        repo,
        pullNumber,
        postedCommentIds,
        activeDedupeKeys,
        totalFindings,
        scanCompleted,
    });
    const summaryBody = formatAuditSummaryBody({
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
        portalServiceUrl,
        notices: loadActionNotices(),
        introLines,
    });
    if (summaryTarget === 'issue_comment') {
        await upsertSummaryIssueComment({
            github,
            owner,
            repo,
            issueNumber: pullNumber,
            body: summaryBody,
        });
    }
    else {
        await github.updatePullRequest({
            owner,
            repo,
            pullNumber,
            body: summaryBody,
        });
    }
    console.log(`Audit feedback: ${posted} inline posted, ${skipped} skipped, ${removed} stale removed, ${candidates.length} candidates`);
    return { posted, skipped, removed, candidates: candidates.length, summaryBody };
}
//# sourceMappingURL=audit-feedback.js.map