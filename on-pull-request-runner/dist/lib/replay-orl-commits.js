/**
 * Replays per-finding ORL hook commits from batch workspaces onto the consumer checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitAddPaths, gitCommit } from './git.js';
import { reportPathToRepoPath } from './normalize-report-path.js';
import { isUnderPath, normalizeRepoPath } from './paths.js';
function gitOutput(args, cwd) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
    }).trim();
}
function gitBuffer(args, cwd) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024,
    });
}
/** Directory where ORL hook `git init` created `.git` for a batch. */
export function resolveBatchGitRoot(batchWorkDir, workspacePath) {
    const ws = normalizeRepoPath(workspacePath);
    const candidates = ws === '.'
        ? [batchWorkDir]
        : [path.join(batchWorkDir, ws), batchWorkDir];
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, '.git')))
            return dir;
    }
    return null;
}
/** Maps a path recorded by batch git/manifest to a repo-relative path. */
export function batchPathToRepoPath(file, workspacePath) {
    return reportPathToRepoPath({ reportPath: file, workspacePath });
}
/** Path as stored in batch git (relative to the hook workspace / git root). */
export function repoPathToBatchGitPath(repoPath, workspacePath) {
    const ws = normalizeRepoPath(workspacePath);
    const rp = normalizeRepoPath(repoPath);
    if (ws === '.')
        return rp;
    if (rp === ws)
        return '.';
    if (isUnderPath({ filePath: rp, dirPath: ws })) {
        return rp.slice(ws.length + 1);
    }
    return rp;
}
/** Lists remediation commits created by ORL hooks (skips the baseline commit). */
export function listCommitsFromBatchGit(batchWorkDir, workspacePath) {
    const gitRoot = resolveBatchGitRoot(batchWorkDir, workspacePath);
    if (!gitRoot)
        return [];
    const shas = gitOutput(['rev-list', '--reverse', 'HEAD'], gitRoot)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (shas.length <= 1)
        return [];
    const commits = [];
    for (let i = 1; i < shas.length; i++) {
        const sha = shas[i];
        const message = gitOutput(['log', '-1', '--format=%B', sha], gitRoot);
        const gitFiles = gitOutput(['diff-tree', '--no-commit-id', '--name-only', '-r', sha], gitRoot)
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const files = [
            ...new Set(gitFiles.map((file) => batchPathToRepoPath(file, workspacePath))),
        ];
        if (!files.length)
            continue;
        commits.push({ message, files, sha });
    }
    return commits;
}
/** Reads hook-written manifest.jsonl when batch git history is unavailable. */
export function listCommitsFromManifest(batchWorkDir, workspacePath) {
    const manifestPath = path.join(batchWorkDir, '.orl', 'diagnostics', 'manifest.jsonl');
    if (!fs.existsSync(manifestPath))
        return [];
    const commits = [];
    for (const line of fs.readFileSync(manifestPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            const row = JSON.parse(trimmed);
            if (!row.message?.trim() || !row.files?.length)
                continue;
            const files = [
                ...new Set(row.files
                    .map((file) => file.trim())
                    .filter(Boolean)
                    .map((file) => batchPathToRepoPath(file, workspacePath))),
            ];
            if (!files.length)
                continue;
            commits.push({
                message: row.message.trim(),
                files,
            });
        }
        catch {
            /* ignore malformed lines */
        }
    }
    return commits;
}
function checkoutFileFromBatch(args) {
    const content = gitBuffer(['show', `${args.sha}:${args.gitPath}`], args.gitRoot);
    fs.mkdirSync(path.dirname(args.dest), { recursive: true });
    fs.writeFileSync(args.dest, content);
}
function copyFileFromBatch(args) {
    const src = path.join(args.batchWorkDir, args.repoPath);
    fs.mkdirSync(path.dirname(args.dest), { recursive: true });
    fs.copyFileSync(src, args.dest);
}
/**
 * Replays per-finding commits from each batch onto `workspaceRoot`.
 * Caller must configure git identity and branch before invoking.
 */
export function replayRemediationCommits(args) {
    const { batches, batchWorkRoot, workspaceRoot } = args;
    const allFiles = new Set();
    let commitCount = 0;
    for (const batch of batches) {
        const batchWorkDir = path.join(batchWorkRoot, batch.batchId);
        if (!fs.existsSync(batchWorkDir))
            continue;
        const gitRoot = resolveBatchGitRoot(batchWorkDir, batch.workspacePath);
        const gitCommits = listCommitsFromBatchGit(batchWorkDir, batch.workspacePath);
        const commits = gitCommits.length > 0
            ? gitCommits
            : listCommitsFromManifest(batchWorkDir, batch.workspacePath);
        if (!commits.length)
            continue;
        for (const commit of commits) {
            for (const repoPath of commit.files) {
                const dest = path.join(workspaceRoot, repoPath);
                if (commit.sha && gitRoot) {
                    checkoutFileFromBatch({
                        gitRoot,
                        sha: commit.sha,
                        gitPath: repoPathToBatchGitPath(repoPath, batch.workspacePath),
                        dest,
                    });
                }
                else {
                    copyFileFromBatch({ batchWorkDir, repoPath, dest });
                }
                allFiles.add(repoPath);
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
//# sourceMappingURL=replay-orl-commits.js.map