/**
 * Git commands against the consumer repository checkout.
 */
import { execFileSync } from 'node:child_process';
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
//# sourceMappingURL=git.js.map