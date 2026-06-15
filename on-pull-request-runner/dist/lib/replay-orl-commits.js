/**
 * Replays per-finding ORL hook commits from batch workspaces onto the consumer checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitAddPaths, gitCommit } from './git.js';
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
/** Lists remediation commits created by ORL hooks (skips the baseline commit). */
export function listCommitsFromBatchGit(batchWorkDir) {
    const gitDir = path.join(batchWorkDir, '.git');
    if (!fs.existsSync(gitDir))
        return [];
    const shas = gitOutput(['rev-list', '--reverse', 'HEAD'], batchWorkDir)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (shas.length <= 1)
        return [];
    const commits = [];
    for (let i = 1; i < shas.length; i++) {
        const sha = shas[i];
        const message = gitOutput(['log', '-1', '--format=%B', sha], batchWorkDir);
        const files = gitOutput(['diff-tree', '--no-commit-id', '--name-only', '-r', sha], batchWorkDir)
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        if (!files.length)
            continue;
        commits.push({ message, files, sha });
    }
    return commits;
}
/** Reads hook-written manifest.jsonl when batch git history is unavailable. */
export function listCommitsFromManifest(batchWorkDir) {
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
            commits.push({
                message: row.message.trim(),
                files: row.files.map((file) => file.trim()).filter(Boolean),
            });
        }
        catch {
            /* ignore malformed lines */
        }
    }
    return commits;
}
function checkoutFileFromBatch(args) {
    const content = gitBuffer(['show', `${args.sha}:${args.file}`], args.batchWorkDir);
    fs.mkdirSync(path.dirname(args.dest), { recursive: true });
    fs.writeFileSync(args.dest, content);
}
function copyFileFromBatch(args) {
    const src = path.join(args.batchWorkDir, args.file);
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
        const gitCommits = listCommitsFromBatchGit(batchWorkDir);
        const commits = gitCommits.length > 0 ? gitCommits : listCommitsFromManifest(batchWorkDir);
        if (!commits.length)
            continue;
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
                }
                else {
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
//# sourceMappingURL=replay-orl-commits.js.map