/**
 * Parses `git diff` hunk headers to list new-side line numbers changed in a PR file.
 */
import { execFileSync } from 'node:child_process';

export type GitDiffChangedLinesArgs = {
  baseSha: string;
  headSha: string;
  cwd: string;
  filePath: string;
};

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Returns sorted unique 1-based line numbers on the PR head side that appear in the diff. */
export function gitDiffChangedLines(args: GitDiffChangedLinesArgs): number[] {
  const { baseSha, headSha, cwd, filePath } = args;
  let out: string;
  try {
    out = execFileSync(
      'git',
      ['diff', '--unified=0', baseSha, headSha, '--', filePath],
      { cwd, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    );
  } catch {
    return [];
  }

  const lines = new Set<number>();
  for (const raw of out.split('\n')) {
    const match = raw.match(HUNK_RE);
    if (!match) continue;
    const start = parseInt(match[1], 10);
    const count = match[2] ? parseInt(match[2], 10) : 1;
    if (!Number.isFinite(start) || start <= 0) continue;
    const span = count > 0 ? count : 1;
    for (let i = 0; i < span; i++) {
      lines.add(start + i);
    }
  }
  return [...lines].sort((a, b) => a - b);
}
