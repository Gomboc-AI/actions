/**
 * Composite step: run `orl detect-language` per touch seed and list touched workspaces.
 */
import fs from 'node:fs';
import { artifactPath, getArtifactsRoot } from './lib/artifacts.js';
import { currentUidGid, dockerRun } from './lib/docker.js';
import { requireEnv } from './lib/env.js';
import { isUnderPath, joinRepoPath, normalizeRepoPath, } from './lib/paths.js';
import { setOutput } from './lib/github-output.js';
import { exitSkip, runMain } from './lib/runner.js';
function loadJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
async function main() {
    const workspace = requireEnv('GITHUB_WORKSPACE');
    const image = requireEnv('ORL_IMAGE');
    const { uid, gid } = currentUidGid();
    const artifactsRoot = getArtifactsRoot();
    fs.mkdirSync(artifactsRoot, { recursive: true });
    const { seeds } = loadJson(artifactPath('touch-seeds.json'));
    const { files: scannable } = loadJson(artifactPath('pr-scannable-files.json'));
    const { paths: changed } = loadJson(artifactPath('pr-changed-paths.json'));
    const workspaceMap = new Map();
    for (let i = 0; i < seeds.length; i++) {
        const seed = normalizeRepoPath(seeds[i]);
        const outFile = artifactPath(`detect-language-${i}.json`);
        const containerOut = `/artifacts/detect-language-${i}.json`;
        const containerTarget = seed === '.' ? '/repo' : `/repo/${seed}`;
        const { status, stderr } = dockerRun({
            argv: [
                'run',
                '--rm',
                '--user',
                `${uid}:${gid}`,
                '-v',
                `${workspace}:/repo`,
                '-v',
                `${artifactsRoot}:/artifacts`,
                image,
                'detect-language',
                '-o',
                containerOut,
                containerTarget,
            ],
        });
        if (status !== 0) {
            console.warn(`detect-language failed for seed ${seed}: ${stderr}`);
            continue;
        }
        if (!fs.existsSync(outFile)) {
            console.warn(`detect-language output missing for seed ${seed}`);
            continue;
        }
        const map = loadJson(outFile);
        for (const [key, langs] of Object.entries(map)) {
            const repoPath = joinRepoPath({ base: seed, rel: key });
            const existing = workspaceMap.get(repoPath) ?? [];
            const names = new Set(existing.map((l) => l.name));
            for (const lang of langs) {
                if (lang.name && !names.has(lang.name)) {
                    existing.push(lang);
                    names.add(lang.name);
                }
            }
            workspaceMap.set(repoPath, existing);
        }
    }
    const touched = [];
    for (const [workspacePath, languages] of workspaceMap) {
        const relevantChanged = [...changed, ...scannable].filter((p) => isUnderPath({ filePath: p, dirPath: workspacePath }));
        if (relevantChanged.length === 0)
            continue;
        touched.push({
            workspacePath,
            languages: languages.map((l) => ({ name: l.name })),
            changedFiles: [...new Set(relevantChanged)],
        });
    }
    fs.writeFileSync(artifactPath('touched-workspaces.json'), JSON.stringify({ workspaces: touched }, null, 2));
    if (touched.length === 0) {
        exitSkip('No ORL workspaces touched by this PR.');
    }
    setOutput('skip', 'false');
    console.log(`Discovered ${touched.length} touched workspace(s)`);
}
runMain(main);
//# sourceMappingURL=discover-workspaces.js.map