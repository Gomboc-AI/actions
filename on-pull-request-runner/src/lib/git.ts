/**
 * Git commands against the consumer repository checkout.
 */
import { execFileSync } from 'node:child_process';

export type GitDiffNameOnlyArgs = {
  baseSha: string;
  headSha: string;
  cwd: string;
};

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/**
 * Lists repo-relative paths changed between two commits (added, copied, modified, renamed, type-changed).
 */
export function gitDiffNameOnly(args: GitDiffNameOnlyArgs): string[] {
  const { baseSha, headSha, cwd } = args;
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRT', baseSha, headSha],
    { cwd, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Returns porcelain status output; empty when working tree is clean. */
export function gitStatusPorcelain(cwd: string): string {
  return git(['status', '--porcelain'], cwd);
}

/** Creates or resets a branch at the current HEAD. */
export function gitCheckoutBranch(branch: string, cwd: string): void {
  git(['checkout', '-B', branch], cwd);
}

/** Stages all changes in the working tree. */
export function gitAddAll(cwd: string): void {
  git(['add', '-A'], cwd);
}

/** Creates a commit with the given message. */
export function gitCommit(message: string, cwd: string): void {
  git(['commit', '-m', message], cwd);
}

/** Pushes a branch to the given remote. */
export function gitPush(remote: string, branch: string, cwd: string): void {
  execFileSync('git', ['push', '--force-with-lease', remote, branch], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
