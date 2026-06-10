/**
 * Groups scannable PR files into workspace × ORL language evaluation batches.
 *
 * Uses SDK language detection (not `orl detect-language` language lists, which are
 * empty until a rulespace is loaded during detection).
 */
import path from 'node:path';
import { isUnderPath, normalizeRepoPath } from './paths.js';
/** Picks the deepest touched workspace containing `filePath`. */
export function deepestWorkspaceForFile(filePath, workspaces) {
    let best = null;
    let bestDepth = -1;
    for (const ws of workspaces) {
        if (!isUnderPath({ filePath, dirPath: ws.workspacePath }))
            continue;
        const depth = ws.workspacePath === '.'
            ? 0
            : ws.workspacePath.split('/').length;
        if (depth >= bestDepth) {
            bestDepth = depth;
            best = ws.workspacePath;
        }
    }
    if (best)
        return best;
    const dir = path.posix.dirname(filePath);
    return dir === '.' ? '.' : normalizeRepoPath(dir);
}
/** Builds one batch per (workspace, ORL language) pair from scannable PR files. */
export function buildEvaluationBatches(args) {
    const { scannableFiles, workspaces, resolveLanguage, warn = console.warn } = args;
    const batchMap = new Map();
    for (const file of scannableFiles) {
        const orlLanguage = resolveLanguage(file);
        if (!orlLanguage) {
            warn(`Skipping unmapped scannable file: ${file}`);
            continue;
        }
        const workspacePath = deepestWorkspaceForFile(file, workspaces);
        const key = `${workspacePath}\0${orlLanguage}`;
        const existing = batchMap.get(key);
        if (existing) {
            existing.files.push(file);
        }
        else {
            batchMap.set(key, { workspacePath, orlLanguage, files: [file] });
        }
    }
    return [...batchMap.values()].map((batch, index) => ({
        batchId: `batch-${index}`,
        workspacePath: batch.workspacePath,
        orlLanguage: batch.orlLanguage,
        files: batch.files,
    }));
}
//# sourceMappingURL=plan-batches.js.map