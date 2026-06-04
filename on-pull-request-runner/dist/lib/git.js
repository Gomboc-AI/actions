/**
 * Git commands against the consumer repository checkout.
 */
import { execFileSync } from 'node:child_process';
function git(args, cwd) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
/**
 * Lists repo-relative paths changed between two commits (added, copied, modified, renamed, type-changed).
 */
export function gitDiffNameOnly(args) {
    const { baseSha, headSha, cwd } = args;
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRT', baseSha, headSha], { cwd, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return out
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
}
/** Returns porcelain status output; empty when working tree is clean. */
export function gitStatusPorcelain(cwd) {
    return git(['status', '--porcelain'], cwd);
}
/** Creates or resets a branch at the current HEAD. */
export function gitCheckoutBranch(branch, cwd) {
    git(['checkout', '-B', branch], cwd);
}
/** Stages all changes in the working tree. */
export function gitAddAll(cwd) {
    git(['add', '-A'], cwd);
}
/** Creates a commit with the given message. */
export function gitCommit(message, cwd) {
    git(['commit', '-m', message], cwd);
}
/** Pushes a branch to the given remote. */
export function gitPush(remote, branch, cwd) {
    execFileSync('git', ['push', '--force-with-lease', remote, branch], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}
//# sourceMappingURL=git.js.map