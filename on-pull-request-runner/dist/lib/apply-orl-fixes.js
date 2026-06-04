/**
 * Applies ORL remediated files from batch work dirs back to the consumer checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeRepoPath } from './paths.js';
function pathsFromRule(rule) {
    const paths = new Set();
    for (const p of Object.keys(rule.files_changed ?? {})) {
        paths.add(normalizeRepoPath(p));
    }
    for (const p of Object.keys(rule.paths_with_findings ?? {})) {
        paths.add(normalizeRepoPath(p));
    }
    for (const file of rule.files ?? []) {
        if (file.path)
            paths.add(normalizeRepoPath(file.path));
    }
    return [...paths];
}
/** Collects repo-relative paths ORL touched in a batch report. */
export function pathsFromReport(report) {
    if (!report)
        return [];
    const paths = new Set();
    for (const rule of report.spec?.rules ?? []) {
        for (const p of pathsFromRule(rule))
            paths.add(p);
    }
    return [...paths].sort();
}
/**
 * Copies remediated files from each batch work dir into `GITHUB_WORKSPACE`.
 * Path set is report-driven with staged-files manifest fallback.
 */
export function applyOrlFixes(args) {
    const { batchWorkRoot, workspaceRoot, batches, reportForBatch, stagedFilesForBatch } = args;
    const copiedPaths = new Set();
    for (const batch of batches) {
        const workDir = path.join(batchWorkRoot, batch.batchId);
        if (!fs.existsSync(workDir))
            continue;
        const reportPaths = pathsFromReport(reportForBatch(batch.batchId));
        const manifestPaths = stagedFilesForBatch(batch.batchId) ?? [];
        const targetPaths = reportPaths.length > 0 ? reportPaths : manifestPaths.map(normalizeRepoPath);
        for (const file of targetPaths) {
            const src = path.join(workDir, file);
            if (!fs.existsSync(src))
                continue;
            const dest = path.join(workspaceRoot, file);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(src, dest);
            copiedPaths.add(file);
        }
    }
    return { copiedPaths: [...copiedPaths].sort() };
}
//# sourceMappingURL=apply-orl-fixes.js.map