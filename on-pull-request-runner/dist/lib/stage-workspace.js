/**
 * Copies PR-scoped files and ORL hooks into an isolated directory for one remediate batch.
 */
import fs from 'node:fs';
import path from 'node:path';
/**
 * Builds a Docker-mounted work directory for a single evaluation batch.
 *
 * @returns Host `workDir` and container `remediatePath` passed to `orl remediate`.
 */
export function stageBatchWorkspace(args) {
    const { batch, workspaceRoot, hooksDir, batchWorkRoot } = args;
    const workDir = path.join(batchWorkRoot, batch.batchId);
    fs.mkdirSync(path.join(workDir, '.orl', 'hooks'), { recursive: true });
    for (const file of batch.files) {
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