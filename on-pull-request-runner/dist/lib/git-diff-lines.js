/**
 * Parses `git diff` output to list new-side line numbers that were added or modified.
 */
import { execFileSync } from 'node:child_process';
const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
/**
 * Returns sorted unique 1-based line numbers on the PR head side that were added (+)
 * or context-changed in the diff. Walking hunks is more reliable than hunk spans alone.
 */
export function gitDiffChangedLines(args) {
    const { baseSha, headSha, cwd, filePath } = args;
    let out;
    try {
        out = execFileSync('git', ['diff', '--unified=0', baseSha, headSha, '--', filePath], { cwd, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    }
    catch {
        return [];
    }
    const lines = new Set();
    let newLine = 0;
    for (const raw of out.split('\n')) {
        const hunk = raw.match(HUNK_RE);
        if (hunk) {
            newLine = parseInt(hunk[2], 10);
            continue;
        }
        if (!raw || raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('diff ')) {
            continue;
        }
        if (raw.startsWith('+')) {
            if (newLine > 0)
                lines.add(newLine);
            newLine++;
            continue;
        }
        if (raw.startsWith(' ')) {
            newLine++;
            continue;
        }
        if (raw.startsWith('-')) {
            continue;
        }
    }
    return [...lines].sort((a, b) => a - b);
}
//# sourceMappingURL=git-diff-lines.js.map