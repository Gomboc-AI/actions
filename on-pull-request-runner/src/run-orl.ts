/**
 * Composite step: parallel `orl remediate` per evaluation batch; merge reports and diagnostics.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { artifactPath, getArtifactsRoot } from './lib/artifacts.js';
import { mapPool } from './lib/concurrency.js';
import { currentUidGid, dockerRun } from './lib/docker.js';
import { envInt } from './lib/env.js';
import { mergeBatchResults, type BatchResult } from './lib/merge-orl-results.js';
import { appendStepSummary } from './lib/github-output.js';
import { stageBatchWorkspace } from './lib/stage-workspace.js';
import { runMain } from './lib/runner.js';
import { requireEnv } from './lib/env.js';
import type { EvaluationBatch, OrlReport } from './types.js';

/** Reads `evaluation-batches.json` written by the plan step. */
function loadBatches(): EvaluationBatch[] {
  const raw = JSON.parse(
    fs.readFileSync(artifactPath('evaluation-batches.json'), 'utf8')
  ) as { batches: EvaluationBatch[] };
  return raw.batches;
}

export type RunBatchArgs = {
  batch: EvaluationBatch;
  image: string;
  rulesDir: string;
  workspaceRoot: string;
  hooksDir: string;
  batchWorkRoot: string;
  timeoutMs: number;
};

/**
 * Stages one batch, runs `orl remediate` in Docker, and copies report/diagnostics to artifacts.
 */
async function runBatch(args: RunBatchArgs): Promise<BatchResult> {
  const { batch, image, rulesDir, workspaceRoot, hooksDir, batchWorkRoot, timeoutMs } =
    args;

  const { workDir, remediatePath } = stageBatchWorkspace({
    batch,
    workspaceRoot,
    hooksDir,
    batchWorkRoot,
  });

  const reportHost = path.join(workDir, '.orl', 'report.yaml');
  const { uid, gid } = currentUidGid();

  const { status, stderr, stdout } = dockerRun({
    argv: [
      'run',
      '--rm',
      '--user',
      `${uid}:${gid}`,
      '-v',
      `${workDir}:/workspace`,
      '-v',
      `${rulesDir}:/workspace/rules:ro`,
      image,
      'remediate',
      remediatePath,
      '--hooks-dir',
      '/workspace/.orl/hooks',
      '--rulespace',
      '/workspace/rules',
      '--language',
      batch.orlLanguage,
      '--out',
      '/workspace/.orl/report.yaml',
    ],
    timeoutMs,
  });

  let report: OrlReport | null = null;
  if (fs.existsSync(reportHost)) {
    report = yaml.parse(fs.readFileSync(reportHost, 'utf8')) as OrlReport;
  }

  const diagHost = path.join(workDir, '.orl', 'diagnostics', 'diagnostics.json');
  let diagnostics: unknown = null;
  if (fs.existsSync(diagHost)) {
    diagnostics = JSON.parse(fs.readFileSync(diagHost, 'utf8'));
  }

  const batchOut = artifactPath(`batches/${batch.batchId}`);
  fs.mkdirSync(batchOut, { recursive: true });
  if (fs.existsSync(reportHost)) {
    fs.copyFileSync(reportHost, path.join(batchOut, 'report.yaml'));
  }
  if (fs.existsSync(diagHost)) {
    fs.copyFileSync(diagHost, path.join(batchOut, 'diagnostics.json'));
  }

  if (status !== 0 && !report) {
    return {
      batchId: batch.batchId,
      workspacePath: batch.workspacePath,
      orlLanguage: batch.orlLanguage,
      exitCode: status,
      report: null,
      diagnostics,
      error: stderr || stdout,
    };
  }

  return {
    batchId: batch.batchId,
    workspacePath: batch.workspacePath,
    orlLanguage: batch.orlLanguage,
    exitCode: status,
    report,
    diagnostics,
  };
}

async function main(): Promise<void> {
  const batches = loadBatches();
  const image = requireEnv('ORL_IMAGE');
  const workspaceRoot = requireEnv('GITHUB_WORKSPACE');
  const rulesDir =
    process.env.ORL_RULES_DIR ??
    fs.readFileSync(artifactPath('rules-dir.txt'), 'utf8').trim();
  const actionPath = requireEnv('GITHUB_ACTION_PATH');
  const hooksDir = path.join(actionPath, 'hooks');
  const batchWorkRoot = artifactPath('orl-workspace');
  const timeoutMs = envInt('INPUT_SCAN_TIMEOUT_SECONDS', 90) * 1000;
  const concurrency = envInt('ORL_REMEDIATE_CONCURRENCY', 3);

  fs.mkdirSync(batchWorkRoot, { recursive: true });

  const results = await mapPool({
    items: batches,
    concurrency,
    fn: (batch) =>
      runBatch({
        batch,
        image,
        rulesDir,
        workspaceRoot,
        hooksDir,
        batchWorkRoot,
        timeoutMs,
      }),
  });

  const outcome = mergeBatchResults(results);

  fs.writeFileSync(
    artifactPath('merged-report.yaml'),
    yaml.stringify(outcome.mergedReport)
  );
  fs.writeFileSync(
    artifactPath('merged-diagnostics.json'),
    JSON.stringify(outcome.mergedDiagnostics, null, 2)
  );

  let summary = '## Gomboc ORL results\n\n';
  summary += `| Workspace | Language | Findings | Fixes | Changes |\n`;
  summary += `|-----------|----------|----------|-------|----------|\n`;
  for (const r of results) {
    const f = r.report?.spec?.findings ?? 0;
    const fx = r.report?.spec?.fixes ?? 0;
    const c = r.report?.spec?.changes ?? 0;
    summary += `| ${r.workspacePath} | ${r.orlLanguage} | ${f} | ${fx} | ${c} |\n`;
  }
  summary += `\n**Totals:** findings=${outcome.mergedReport.spec.findings}, fixes=${outcome.mergedReport.spec.fixes}, changes=${outcome.mergedReport.spec.changes}\n`;
  if (outcome.warnings.length) {
    summary += `\n### Warnings\n${outcome.warnings.map((w) => `- ${w}`).join('\n')}\n`;
  }
  appendStepSummary(summary);

  fs.writeFileSync(
    path.join(getArtifactsRoot(), 'run-complete.json'),
    JSON.stringify({ ok: !outcome.hadExecutionFailure }, null, 2)
  );

  if (outcome.hadExecutionFailure) {
    throw new Error('One or more ORL remediate batches failed to execute (exit 1)');
  }

  console.log('ORL remediate completed for all batches');
}

runMain(main);
