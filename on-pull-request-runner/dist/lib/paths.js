/**
 * Repo-relative path normalization and touch-seed computation for PR scope.
 */
import path from 'node:path';
/** Normalize ORL/SDK path keys to repo-relative posix paths. */
export function normalizeRepoPath(p) {
    let s = (p ?? '').trim().replace(/\\/g, '/');
    if (s.startsWith('./'))
        s = s.slice(2);
    if (s === '.' || s === '')
        return '.';
    return s.replace(/\/+$/, '') || '.';
}
/** Joins two repo-relative paths using posix rules. */
export function joinRepoPath(args) {
    const { base, rel } = args;
    const b = normalizeRepoPath(base);
    const r = normalizeRepoPath(rel);
    if (b === '.')
        return r;
    if (r === '.')
        return b;
    return normalizeRepoPath(path.posix.join(b, r));
}
/** True if `filePath` is `dirPath` or a descendant directory. */
export function isUnderPath(args) {
    const { filePath, dirPath } = args;
    const f = normalizeRepoPath(filePath);
    const d = normalizeRepoPath(dirPath);
    if (d === '.')
        return true;
    return f === d || f.startsWith(`${d}/`);
}
/** Minimal touch seeds: deepest dirs covering all changed paths. */
export function computeTouchSeeds(changedPaths) {
    const dirs = new Set();
    for (const p of changedPaths) {
        const norm = normalizeRepoPath(p);
        if (norm.endsWith('/')) {
            dirs.add(normalizeRepoPath(norm.replace(/\/+$/, '')));
            continue;
        }
        const dir = path.posix.dirname(norm);
        dirs.add(dir === '.' ? '.' : normalizeRepoPath(dir));
    }
    const sorted = [...dirs].sort((a, b) => b.split('/').length - a.split('/').length);
    const minimal = [];
    for (const seed of sorted) {
        if (minimal.some((kept) => isUnderPath({ filePath: seed, dirPath: kept }) && seed !== kept)) {
            continue;
        }
        minimal.push(seed);
    }
    return minimal;
}
//# sourceMappingURL=paths.js.map