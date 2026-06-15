/**
 * Composite step: PR diff scope — changed paths, scannable filter, touch seeds.
 */
import fs from 'node:fs';
import { artifactPath } from './lib/artifacts.js';
import { envInt } from './lib/env.js';
import { gitDiffNameOnly } from './lib/git.js';
import { setOutput } from './lib/github-output.js';
import { loadPullRequestContext } from './lib/github-context.js';
import { isScannable } from './lib/language.js';
import { computeTouchSeeds, isRemediationBotBranch } from './lib/paths.js';
import { exitSkip, runMain } from './lib/runner.js';
import { requireEnv } from './lib/env.js';
async function main() {
    const pr = loadPullRequestContext();
    const workspace = requireEnv('GITHUB_WORKSPACE');
    const maxFiles = envInt('INPUT_MAX_CHANGED_FILES', 50);
    const mode = (process.env.INPUT_MODE ?? '').trim();
    const branchPrefix = process.env.INPUT_REMEDIATION_BRANCH_PREFIX?.trim() || 'gomboc/orl-remediation';
    if (mode === 'remediate' && isRemediationBotBranch(pr.headRef, branchPrefix)) {
        exitSkip(`Skipping remediate on Gomboc remediation branch ${pr.headRef}.`);
    }
    const changed = gitDiffNameOnly({
        baseSha: pr.baseSha,
        headSha: pr.headSha,
        cwd: workspace,
    });
    fs.mkdirSync(artifactPath(''), { recursive: true });
    fs.writeFileSync(artifactPath('pr-changed-paths.json'), JSON.stringify({ paths: changed }, null, 2));
    if (changed.length > maxFiles) {
        throw new Error(`PR changes ${changed.length} paths exceeds max-changed-files (${maxFiles}). Split the PR or raise the limit.`);
    }
    const scannable = changed.filter((p) => isScannable({ filePath: p, workspaceRoot: workspace }));
    fs.writeFileSync(artifactPath('pr-scannable-files.json'), JSON.stringify({ files: scannable }, null, 2));
    if (scannable.length === 0) {
        setOutput('skip', 'true');
        exitSkip('No ORL-scannable files changed in this PR.');
    }
    const seeds = computeTouchSeeds(changed);
    fs.writeFileSync(artifactPath('touch-seeds.json'), JSON.stringify({ seeds }, null, 2));
    setOutput('skip', 'false');
    console.log(`PR scope: ${changed.length} changed path(s), ${scannable.length} scannable, ${seeds.length} touch seed(s)`);
}
runMain(main);
//# sourceMappingURL=resolve-pr-files.js.map