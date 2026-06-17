import { normalizeReportFilePath, reportPathToRepoPath } from './normalize-report-path.js';
import { formatScoreLabel, ruleDescription, ruleImpactRisk } from './rule-metadata.js';
import { portalRuleUrl } from './portal-url.js';
import { resolveScannablePath } from './scannable-path.js';
import { countRuleFindings, countRuleRemediationSlots } from './report-counts.js';
import { compareRulesByImpactRisk } from './rule-metadata.js';
export const AUDIT_COMMENT_MARKER = '<!-- gomboc-orl-audit -->';
export function auditCommentMarker(dedupeKey) {
    return `<!-- gomboc-orl-audit key=${dedupeKey} -->`;
}
export function isAuditCommentBody(body) {
    return body.includes('gomboc-orl-audit');
}
const AUDIT_DEDUPE_KEY_RE = /<!-- gomboc-orl-audit(?: key=([^\s>]+))? -->/;
export function parseAuditCommentDedupeKey(body) {
    const match = body.match(AUDIT_DEDUPE_KEY_RE);
    if (!match)
        return null;
    return match[1] ?? null;
}
function ruleMeta(rule) {
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
function anchorFromLocation(loc) {
    if (typeof loc.start_line !== 'number' || loc.start_line <= 0)
        return null;
    return {
        line: loc.start_line,
        startLine: loc.start_line,
        endLine: typeof loc.end_line === 'number' ? loc.end_line : undefined,
    };
}
function locationFromFindingRow(row) {
    return row.original_location ?? row.resolved_location ?? null;
}
/** Post-remediation fix location from the ORL report (remediation PR comments only). */
function fixLocationFromFindingRow(row) {
    return row.resolved_location ?? null;
}
function lineFromReportEntry(entry) {
    if (entry == null)
        return null;
    if (typeof entry === 'number' && entry > 0) {
        return { line: entry };
    }
    if (typeof entry !== 'object')
        return null;
    const o = entry;
    const asLocation = o;
    if (typeof asLocation.file_path === 'string' && typeof asLocation.start_line === 'number') {
        return anchorFromLocation(asLocation);
    }
    for (const key of ['line', 'startLine', 'start_line', 'line_number', 'lineNumber']) {
        const v = o[key];
        if (typeof v === 'number' && v > 0) {
            const end = typeof o.endLine === 'number'
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
            if (nested)
                return nested;
        }
    }
    if (Array.isArray(entry)) {
        for (const item of entry) {
            const nested = lineFromReportEntry(item);
            if (nested)
                return nested;
        }
    }
    return null;
}
function lineFromDiagnostics(args) {
    const { diagnostics, ruleName, repoPath } = args;
    if (!diagnostics?.rules?.length)
        return null;
    const normalizedTarget = normalizeReportFilePath(repoPath);
    for (const dr of diagnostics.rules) {
        if (dr.ruleName && dr.ruleName !== ruleName)
            continue;
        for (const file of dr.files ?? []) {
            if (!file.path)
                continue;
            if (normalizeReportFilePath(file.path) !== normalizedTarget)
                continue;
            for (const h of file.hunks ?? []) {
                if (typeof h.startLine === 'number' && h.startLine > 0) {
                    return {
                        line: h.startLine,
                        startLine: h.startLine,
                        endLine: typeof h.endLine === 'number' ? h.endLine : undefined,
                    };
                }
            }
            for (const r of file.resources ?? []) {
                if (typeof r.startLine === 'number' && r.startLine > 0) {
                    return {
                        line: r.startLine,
                        startLine: r.startLine,
                        endLine: typeof r.endLine === 'number' ? r.endLine : undefined,
                    };
                }
            }
        }
    }
    return null;
}
function pathsFromRule(rule) {
    const out = new Map();
    for (const [path, entry] of Object.entries(rule.paths_with_findings ?? {})) {
        out.set(path, entry);
    }
    for (const [path, entry] of Object.entries(rule.files_changed ?? {})) {
        if (!out.has(path))
            out.set(path, entry);
    }
    if (out.size === 0) {
        for (const file of rule.files ?? []) {
            if (file.path)
                out.set(file.path, {});
        }
    }
    return [...out.entries()].map(([path, entry]) => ({ path, entry }));
}
function diagnosticsForBatch(batchDiagnostics, batchId) {
    return batchDiagnostics.find((b) => b.batchId === batchId)?.diagnostics ?? null;
}
function firstDiffLine(diffChangedLines, scannablePath) {
    const lines = diffChangedLines?.get(scannablePath);
    if (!lines?.length)
        return null;
    return lines[0];
}
/** One inline comment per rule × file × line (ignores finding row id). */
export function canonicalAnchorDedupeKey(ruleName, scannablePath, line) {
    return `${ruleName}:${scannablePath}:${line}`;
}
/** One inline comment per finding on remediation PRs. */
export function remediationFindingDedupeKey(ruleName, findingId, scannablePath) {
    return `${ruleName}:${findingId}:${scannablePath}`;
}
function buildRemediationCandidatesFromResolvedLocations(args) {
    const { rule, workspacePath, prScannableFiles } = args;
    const meta = ruleMeta(rule);
    const candidates = [];
    for (const row of rule.finding_locations ?? []) {
        const loc = fixLocationFromFindingRow(row);
        if (!loc?.file_path)
            continue;
        const repoPath = reportPathToRepoPath({
            reportPath: loc.file_path,
            workspacePath,
        });
        const scannablePath = resolveScannablePath(repoPath, prScannableFiles);
        if (!scannablePath)
            continue;
        const anchor = anchorFromLocation(loc);
        if (!anchor)
            continue;
        candidates.push({
            dedupeKey: remediationFindingDedupeKey(rule.name, row.id || `${rule.name}-finding`, scannablePath),
            ruleName: rule.name,
            displayName: meta.displayName,
            description: meta.description,
            impact: meta.impact,
            impactStatement: meta.impactStatement,
            risk: meta.risk,
            riskStatement: meta.riskStatement,
            filePath: scannablePath,
            line: anchor.line,
            startLine: anchor.startLine,
            endLine: anchor.endLine,
        });
    }
    return candidates;
}
function buildRemediationCandidatesForBatch(args) {
    const { rules, workspacePath, prScannableFiles } = args;
    const candidates = [];
    for (const rule of rules) {
        const slotLimit = countRuleRemediationSlots(rule);
        if (slotLimit <= 0)
            continue;
        candidates.push(...buildRemediationCandidatesFromResolvedLocations({
            rule,
            workspacePath,
            prScannableFiles,
        }).slice(0, slotLimit));
    }
    return candidates;
}
function tryFindingLocationRows(args) {
    const { rule, workspacePath, prScannableFiles } = args;
    const out = [];
    for (const row of rule.finding_locations ?? []) {
        const loc = locationFromFindingRow(row);
        if (!loc?.file_path)
            continue;
        const repoPath = reportPathToRepoPath({
            reportPath: loc.file_path,
            workspacePath,
        });
        const scannablePath = resolveScannablePath(repoPath, prScannableFiles);
        if (!scannablePath)
            continue;
        const anchor = anchorFromLocation(loc);
        if (!anchor)
            continue;
        out.push({
            scannablePath,
            anchor,
            dedupeKey: canonicalAnchorDedupeKey(rule.name, scannablePath, anchor.line),
        });
    }
    return out;
}
function tryLegacyPaths(args) {
    const { rule, workspacePath, diagnostics, prScannableFiles, diffChangedLines } = args;
    const out = [];
    const pathEntries = pathsFromRule(rule);
    if (pathEntries.length === 0 && countRuleFindings(rule) > 0) {
        for (const dr of diagnostics?.rules ?? []) {
            if (dr.ruleName && dr.ruleName !== rule.name)
                continue;
            for (const file of dr.files ?? []) {
                if (!file.path)
                    continue;
                pathEntries.push({ path: file.path, entry: file });
            }
        }
    }
    for (const { path, entry } of pathEntries) {
        const repoPath = reportPathToRepoPath({ reportPath: path, workspacePath });
        const scannablePath = resolveScannablePath(repoPath, prScannableFiles);
        if (!scannablePath)
            continue;
        let anchor = lineFromReportEntry(entry) ??
            lineFromDiagnostics({ diagnostics, ruleName: rule.name, repoPath: scannablePath });
        if (!anchor) {
            const diffLine = firstDiffLine(diffChangedLines, scannablePath);
            if (diffLine)
                anchor = { line: diffLine, startLine: diffLine };
        }
        if (!anchor)
            continue;
        out.push({
            scannablePath,
            anchor,
            dedupeKey: canonicalAnchorDedupeKey(rule.name, scannablePath, anchor.line),
        });
    }
    return out;
}
/** Collects deduped inline comment anchors limited to PR-scannable paths. */
export function extractAuditCommentCandidates(args) {
    const { batchReports, batchDiagnostics, prScannableFiles, diffChangedLines, anchorStrategy = 'audit', } = args;
    const seen = new Set();
    const candidates = [];
    for (const { batchId, workspacePath, report } of batchReports) {
        const diagnostics = diagnosticsForBatch(batchDiagnostics, batchId);
        const batchRules = report.spec?.rules ?? [];
        if (anchorStrategy === 'remediation') {
            const rulesWithFixes = batchRules.filter((rule) => countRuleRemediationSlots(rule) > 0);
            const remediationCandidates = buildRemediationCandidatesForBatch({
                rules: rulesWithFixes,
                workspacePath,
                prScannableFiles,
            });
            for (const candidate of remediationCandidates) {
                if (seen.has(candidate.dedupeKey))
                    continue;
                seen.add(candidate.dedupeKey);
                candidates.push(candidate);
            }
            continue;
        }
        for (const rule of batchRules) {
            if (countRuleFindings(rule) <= 0 && !(rule.finding_locations?.length ?? 0)) {
                if (pathsFromRule(rule).length === 0)
                    continue;
            }
            const meta = ruleMeta(rule);
            const locationRows = tryFindingLocationRows({
                rule,
                workspacePath,
                prScannableFiles,
            });
            const attempts = locationRows.length > 0
                ? locationRows
                : tryLegacyPaths({
                    rule,
                    workspacePath,
                    diagnostics,
                    prScannableFiles,
                    diffChangedLines,
                });
            for (const attempt of attempts) {
                if (seen.has(attempt.dedupeKey))
                    continue;
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
export function capAuditCommentCandidates(args) {
    const { candidates, rules, totalFindingsCap, perRuleLimit = countRuleFindings } = args;
    const rulesByName = new Map(rules.map((r) => [r.name, r]));
    const sorted = [...candidates].sort((a, b) => {
        const ruleA = rulesByName.get(a.ruleName);
        const ruleB = rulesByName.get(b.ruleName);
        if (ruleA && ruleB) {
            const byRule = compareRulesByImpactRisk(ruleA, ruleB);
            if (byRule !== 0)
                return byRule;
        }
        const pathCmp = a.filePath.localeCompare(b.filePath);
        if (pathCmp !== 0)
            return pathCmp;
        return a.line - b.line;
    });
    const perRulePosted = new Map();
    const capped = [];
    for (const candidate of sorted) {
        const rule = rulesByName.get(candidate.ruleName);
        const limit = rule ? perRuleLimit(rule) : 0;
        if (limit <= 0)
            continue;
        const posted = perRulePosted.get(candidate.ruleName) ?? 0;
        if (posted >= limit)
            continue;
        perRulePosted.set(candidate.ruleName, posted + 1);
        capped.push(candidate);
    }
    if (totalFindingsCap != null &&
        totalFindingsCap > 0 &&
        capped.length > totalFindingsCap) {
        return capped.slice(0, totalFindingsCap);
    }
    return capped;
}
function formatSeverityRiskSection(args) {
    const title = `### ${args.label}: \`${formatScoreLabel(args.score)}\``;
    const statement = args.statement?.trim();
    if (!statement) {
        return ['', title];
    }
    return ['', title, '', statement];
}
/** Removes a leading `## Description` heading and demotes other `##` headings to `####`. */
export function stripDescriptionHeading(description) {
    const withoutDescription = description
        .trim()
        .replace(/^##\s+Description\s*\n*/i, '')
        .trim();
    return withoutDescription.replace(/(^|\n)## (?![#])/gm, '$1#### ');
}
function formatDescriptionWithReadMore(args) {
    const text = args.description.trim();
    const portal = args.portalServiceUrl?.trim();
    if (!text && !portal)
        return null;
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
export function formatInlineCommentBody(candidate, options = {}) {
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
    lines.push(...formatSeverityRiskSection({
        label: 'Severity',
        score: candidate.impact,
        statement: candidate.impactStatement,
    }), ...formatSeverityRiskSection({
        label: 'Risk',
        score: candidate.risk,
        statement: candidate.riskStatement,
    }));
    return lines.join('\n').trimEnd();
}
//# sourceMappingURL=extract-audit-comments.js.map