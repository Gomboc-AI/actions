/**
 * Replays per-finding ORL hook commits from batch workspaces onto the consumer checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { EvaluationBatch } from '../types.js';
import { gitAddPaths, gitCommit } from './git.js';

export type RemediationCommit = {
  message: string;
  files: string[];
  sha?: string;
};

function gitOutput(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
}

function gitBuffer(args: string[], cwd: string): Buffer {
  return execFileSync('git', args, {
    cwd,
    encoding: 'buffer',
    maxBuffer: 50 * 1024 * 1024,
  }) as Buffer;
}

/** Lists remediation commits created by ORL hooks (skips the baseline commit). */
export function listCommitsFromBatchGit(batchWorkDir: string): RemediationCommit[] {
  const gitDir = path.join(batchWorkDir, '.git');
  if (!fs.existsSync(gitDir)) return [];

  const shas = gitOutput(['rev-list', '--reverse', 'HEAD'], batchWorkDir)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (shas.length <= 1) return [];

  const commits: RemediationCommit[] = [];
  for (let i = 1; i < shas.length; i++) {
    const sha = shas[i]!;
    const message = gitOutput(['log', '-1', '--format=%B', sha], batchWorkDir);
    const files = gitOutput(['diff-tree', '--no-commit-id', '--name-only', '-r', sha], batchWorkDir)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!files.length) continue;
    commits.push({ message, files, sha });
  }
  return commits;
}

/** Reads hook-written manifest.jsonl when batch git history is unavailable. */
export function listCommitsFromManifest(batchWorkDir: string): RemediationCommit[] {
  const manifestPath = path.join(batchWorkDir, '.orl', 'diagnostics', 'manifest.jsonl');
  if (!fs.existsSync(manifestPath)) return [];

  const commits: RemediationCommit[] = [];
  for (const line of fs.readFileSync(manifestPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as {
        message?: string;
        files?: string[];
      };
      if (!row.message?.trim() || !row.files?.length) continue;
      commits.push({
        message: row.message.trim(),
        files: row.files.map((file) => file.trim()).filter(Boolean),
      });
    } catch {
      /* ignore malformed lines */
    }
  }
  return commits;
}

function checkoutFileFromBatch(args: {
  batchWorkDir: string;
  sha: string;
  file: string;
  dest: string;
}): void {
  const content = gitBuffer(['show', `${args.sha}:${args.file}`], args.batchWorkDir);
  fs.mkdirSync(path.dirname(args.dest), { recursive: true });
  fs.writeFileSync(args.dest, content);
}

function copyFileFromBatch(args: {
  batchWorkDir: string;
  file: string;
  dest: string;
}): void {
  const src = path.join(args.batchWorkDir, args.file);
  fs.mkdirSync(path.dirname(args.dest), { recursive: true });
  fs.copyFileSync(src, args.dest);
}

export type ReplayRemediationCommitsArgs = {
  batches: EvaluationBatch[];
  batchWorkRoot: string;
  workspaceRoot: string;
};

export type ReplayRemediationCommitsResult = {
  commitCount: number;
  allFiles: string[];
};

/**
 * Replays per-finding commits from each batch onto `workspaceRoot`.
 * Caller must configure git identity and branch before invoking.
 */
export function replayRemediationCommits(
  args: ReplayRemediationCommitsArgs
): ReplayRemediationCommitsResult {
  const { batches, batchWorkRoot, workspaceRoot } = args;
  const allFiles = new Set<string>();
  let commitCount = 0;

  for (const batch of batches) {
    const batchWorkDir = path.join(batchWorkRoot, batch.batchId);
    if (!fs.existsSync(batchWorkDir)) continue;

    const gitCommits = listCommitsFromBatchGit(batchWorkDir);
    const commits = gitCommits.length > 0 ? gitCommits : listCommitsFromManifest(batchWorkDir);
    if (!commits.length) continue;

    for (const commit of commits) {
      for (const file of commit.files) {
        const dest = path.join(workspaceRoot, file);
        if (commit.sha) {
          checkoutFileFromBatch({
            batchWorkDir,
            sha: commit.sha,
            file,
            dest,
          });
        } else {
          copyFileFromBatch({ batchWorkDir, file, dest });
        }
        allFiles.add(file);
      }
      gitAddPaths(commit.files, workspaceRoot);
      gitCommit(commit.message, workspaceRoot);
      commitCount++;
    }
  }

  return {
    commitCount,
    allFiles: [...allFiles].sort(),
  };
}
