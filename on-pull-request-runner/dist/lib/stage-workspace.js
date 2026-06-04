/**
 * Copies PR-scoped files and ORL hooks into an isolated directory for one remediate batch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeRepoPath } from './paths.js';
function filesToStage(batch, workspaceRoot) {
    const staged = new Set(batch.files.map(normalizeRepoPath));
    for (const file of batch.files) {
        const normalized = normalizeRepoPath(file);
        const dir = path.posix.dirname(normalized);
        const absDir = path.join(workspaceRoot, dir === '.' ? '' : dir);
        try {
            for (const name of fs.readdirSync(absDir)) {
                if (!name.endsWith('.tf'))
                    continue;
                const repoPath = dir === '.' ? name : `${dir}/${name}`;
                staged.add(normalizeRepoPath(repoPath));
            }
        }
        catch {
            /* directory may not exist */
        }
    }
    return [...staged].sort();
}
/**
 * Builds a Docker-mounted work directory for a single evaluation batch.
 *
 * @returns Host `workDir` and container `remediatePath` passed to `orl remediate`.
 */
export function stageBatchWorkspace(args) {
    const { batch, workspaceRoot, hooksDir, batchWorkRoot } = args;
    const workDir = path.join(batchWorkRoot, batch.batchId);
    fs.mkdirSync(path.join(workDir, '.orl', 'hooks'), { recursive: true });
    const files = filesToStage(batch, workspaceRoot);
    for (const file of files) {
        const src = path.join(workspaceRoot, file);
        const dest = path.join(workDir, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
    if (fs.existsSync(hooksDir)) {
        for (const name of fs.readdirSync(hooksDir)) {
            const src = path.join(hooksDir, name);
            if (!fs.statSync(src).isFile())
                continue;
            fs.copyFileSync(src, path.join(workDir, '.orl', 'hooks', name));
            try {
                fs.chmodSync(path.join(workDir, '.orl', 'hooks', name), 0o755);
            }
            catch {
                /* windows */
            }
        }
    }
    const wp = batch.workspacePath === '.' ? workDir : path.join(workDir, batch.workspacePath);
    if (batch.workspacePath !== '.') {
        fs.mkdirSync(wp, { recursive: true });
    }
    const remediatePath = batch.workspacePath === '.' ? '/workspace' : `/workspace/${batch.workspacePath}`;
    return { workDir, remediatePath };
}
//# sourceMappingURL=stage-workspace.js.map