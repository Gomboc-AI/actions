/**
 * Composite step: group scannable PR files into workspace × ORL language batches.
 */
import fs from 'node:fs';
import { artifactPath } from './lib/artifacts.js';
import { orlLanguageForFile } from './lib/language.js';
import { buildEvaluationBatches } from './lib/plan-batches.js';
import { setOutput } from './lib/github-output.js';
import { exitSkip, runMain } from './lib/runner.js';
import { requireEnv } from './lib/env.js';
import type { TouchedWorkspace } from './types.js';

async function main(): Promise<void> {
  const workspace = requireEnv('GITHUB_WORKSPACE');
  const { files: scannable } = JSON.parse(
    fs.readFileSync(artifactPath('pr-scannable-files.json'), 'utf8')
  ) as { files: string[] };
  const { workspaces } = JSON.parse(
    fs.readFileSync(artifactPath('touched-workspaces.json'), 'utf8')
  ) as { workspaces: TouchedWorkspace[] };

  const batches = buildEvaluationBatches({
    scannableFiles: scannable,
    workspaces,
    resolveLanguage: (filePath) =>
      orlLanguageForFile({ filePath, workspaceRoot: workspace }),
  });

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
