/**
 * Composite step: group scannable PR files into workspace × ORL language batches.
 */
import fs from 'node:fs';
import { artifactPath } from './lib/artifacts.js';
import { orlLanguageForFile } from './lib/language.js';
import { isUnderPath } from './lib/paths.js';
import { setOutput } from './lib/github-output.js';
import { exitSkip, runMain } from './lib/runner.js';
import { requireEnv } from './lib/env.js';
import type { EvaluationBatch, TouchedWorkspace } from './types.js';

async function main(): Promise<void> {
  const workspace = requireEnv('GITHUB_WORKSPACE');
  const { files: scannable } = JSON.parse(
    fs.readFileSync(artifactPath('pr-scannable-files.json'), 'utf8')
  ) as { files: string[] };
  const { workspaces } = JSON.parse(
    fs.readFileSync(artifactPath('touched-workspaces.json'), 'utf8')
  ) as { workspaces: TouchedWorkspace[] };

  const batches: EvaluationBatch[] = [];
  let batchIndex = 0;

  for (const ws of workspaces) {
    for (const lang of ws.languages) {
      const files = scannable.filter((file) => {
        if (!isUnderPath({ filePath: file, dirPath: ws.workspacePath })) return false;
        const orlLang = orlLanguageForFile({ filePath: file, workspaceRoot: workspace });
        return orlLang === lang.name;
      });

      if (files.length === 0) continue;

      batches.push({
        batchId: `batch-${batchIndex++}`,
        workspacePath: ws.workspacePath,
        orlLanguage: lang.name,
        files,
      });
    }
  }

  fs.writeFileSync(
    artifactPath('evaluation-batches.json'),
    JSON.stringify({ batches }, null, 2)
  );

  if (batches.length === 0) {
    exitSkip('No evaluation batches for touched workspaces.');
  }

  setOutput('skip', 'false');
  console.log(`Planned ${batches.length} evaluation batch(es)`);
}

runMain(main);
