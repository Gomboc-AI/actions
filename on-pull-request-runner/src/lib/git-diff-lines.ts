/**
 * Parses `git diff` output to list new-side line numbers that were added or modified.
 */
import { execFileSync } from 'node:child_process';

export type GitDiffChangedLinesArgs = {
  baseSha: string;
  headSha: string;
  cwd: string;
  filePath: string;
};

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function parseDiffOutput(out: string, includeContext: boolean): number[] {
  const lines = new Set<number>();
  let newLine = 0;

  for (const raw of out.split('\n')) {
    const hunk = raw.match(HUNK_RE);
    if (hunk) {
      newLine = parseInt(hunk[2]!, 10);
      continue;
    }
    if (!raw || raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('diff ')) {
      continue;
    }
    if (raw.startsWith('+')) {
      if (newLine > 0) lines.add(newLine);
      newLine++;
      continue;
    }
    if (raw.startsWith(' ')) {
      if (includeContext && newLine > 0) lines.add(newLine);
      newLine++;
      continue;
    }
    if (raw.startsWith('-')) {
      continue;
    }
  }

  return [...lines].sort((a, b) => a - b);
}

function runGitDiff(args: GitDiffChangedLinesArgs, unified: number): string {
  return execFileSync(
    'git',
    ['diff', `--unified=${unified}`, args.baseSha, args.headSha, '--', args.filePath],
    { cwd: args.cwd, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );
}

/**
 * Returns sorted unique 1-based line numbers on the PR head side that appear in the
 * diff and can anchor review comments (added lines plus in-hunk context with -U3).
 */
export function gitDiffChangedLines(args: GitDiffChangedLinesArgs): number[] {
  try {
    const withContext = parseDiffOutput(runGitDiff(args, 3), true);
    if (withContext.length) return withContext;
    return parseDiffOutput(runGitDiff(args, 0), false);
  } catch {
    return [];
  }
}
