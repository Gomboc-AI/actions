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
const DEFAULT_COMMIT_NAME = 'github-actions[bot]';
const DEFAULT_COMMIT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
/**
 * Sets local `user.name` / `user.email` in the consumer repo (runners often have none).
 * Override with `GIT_COMMIT_USER_NAME` / `GIT_COMMIT_USER_EMAIL`.
 */
export function configureGitIdentity(cwd) {
    const name = process.env.GIT_COMMIT_USER_NAME?.trim() ||
        process.env.GITHUB_ACTOR?.trim() ||
        DEFAULT_COMMIT_NAME;
    const email = process.env.GIT_COMMIT_USER_EMAIL?.trim() || DEFAULT_COMMIT_EMAIL;
    git(['config', 'user.name', name], cwd);
    git(['config', 'user.email', email], cwd);
}
/** Resolves a git ref to a full commit SHA. */
export function gitRevParse(ref, cwd) {
    return git(['rev-parse', ref], cwd);
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