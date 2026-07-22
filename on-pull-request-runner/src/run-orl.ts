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
import { countRuleFindings, totalsFromReport } from './lib/report-counts.js';
import { appendStepSummary } from './lib/github-output.js';
import { appendActionNotice } from './lib/action-notices.js';
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
  mode: string;
  /** ORL global `--timeout` value (e.g. `10m`); omitted when unset. */
  orlTimeout?: string;
  /** ORL `--default-rule-timeout` value (e.g. `5s`); omitted when unset. */
  orlRuleTimeout?: string;
};

/**
 * Stages one batch, runs `orl audit`/`remediate` in Docker, and copies report/diagnostics to artifacts.
 */
async function runBatch(args: RunBatchArgs): Promise<BatchResult> {
  const {
    batch,
    image,
    rulesDir,
    workspaceRoot,
    hooksDir,
    batchWorkRoot,
    timeoutMs,
    mode,
    orlTimeout,
    orlRuleTimeout,
  } = args;

  const { workDir, remediatePath, stagedFiles } = stageBatchWorkspace({
    batch,
    workspaceRoot,
    hooksDir,
    batchWorkRoot,
  });

  const reportHost = path.join(workDir, '.orl', 'report.yaml');
  const { uid, gid } = currentUidGid();
  const containerName = `gomboc-orl-${batch.batchId}`;

  const baseOrlArgv = [
    remediatePath,
    '--hooks-dir',
    '/workspace/.orl/hooks',
    '--rulespace',
    '/workspace/rules',
    '--recursive-rulespace',
    '--include-location-info',
    '--language',
    batch.orlLanguage,
    '--out',
    '/workspace/.orl/report.yaml',
  ];
  if (orlTimeout) {
    baseOrlArgv.push('--timeout', orlTimeout);
  }
  if (orlRuleTimeout) {
    baseOrlArgv.push('--default-rule-timeout', orlRuleTimeout);
  }

  let report: OrlReport | null = null;
  let status = 0;
  let stderr = '';
  let stdout = '';

  const runDockerWithSubcommand = async (subcommand: string) => {
    return await dockerRun({
      argv: [
        'run',
        '--rm',
        '--name',
        containerName,
        '--user',
        `${uid}:${gid}`,
        '-v',
        `${workDir}:/workspace`,
        '-v',
        `${rulesDir}:/workspace/rules:ro`,
        image,
        subcommand,
        ...baseOrlArgv,
      ],
      timeoutMs,
      containerName,
    });
  };

  const isAudit = mode === 'audit';

  if (isAudit) {
    console.log(`[Batch ${batch.batchId}] Starting Pass 1: orl audit`);
    const res = await runDockerWithSubcommand('audit');
    status = res.status;
    stderr = res.stderr;
    stdout = res.stdout;

    if (stdout) {
      console.log(`[Batch ${batch.batchId}] orl audit stdout:\n${stdout}`);
    }
    if (stderr) {
      console.warn(`[Batch ${batch.batchId}] orl audit stderr:\n${stderr}`);
    }

    if (fs.existsSync(reportHost)) {
      report = yaml.parse(fs.readFileSync(reportHost, 'utf8')) as OrlReport;
    }

    const totalFindings = report?.spec?.findings ?? 0;
    if (totalFindings === 0 || status === 0) {
      console.log(`[Batch ${batch.batchId}] Pass 1 complete: 0 findings (or exit 0). Fast-Path Exit.`);
    } else {
      let hasRemediable = false;
      for (const rule of report?.spec?.rules ?? []) {
        for (const loc of rule.finding_locations ?? []) {
          if (loc.remediable) {
            hasRemediable = true;
            break;
          }
        }
        if (hasRemediable) break;
      }

      if (hasRemediable) {
        console.log(`[Batch ${batch.batchId}] Remediable findings found. Starting Pass 2: orl remediate`);
        const res2 = await runDockerWithSubcommand('remediate');
        status = res2.status;
        stderr = res2.stderr;
        stdout = res2.stdout;

        if (fs.existsSync(reportHost)) {
          report = yaml.parse(fs.readFileSync(reportHost, 'utf8')) as OrlReport;
        }
      } else {
        console.log(`[Batch ${batch.batchId}] No remediable findings found. Skipping Pass 2.`);
      }
    }
  } else {
    console.log(`[Batch ${batch.batchId}] Starting remediate`);
    const res = await runDockerWithSubcommand('remediate');
    status = res.status;
    stderr = res.stderr;
    stdout = res.stdout;

    if (fs.existsSync(reportHost)) {
      report = yaml.parse(fs.readFileSync(reportHost, 'utf8')) as OrlReport;
    }
  }

  const diagHost = path.join(workDir, '.orl', 'diagnostics', 'diagnostics.json');
  let diagnostics: unknown = null;
  if (fs.existsSync(diagHost)) {
    diagnostics = JSON.parse(fs.readFileSync(diagHost, 'utf8'));
  }

  const batchOut = artifactPath(`batches/${batch.batchId}`);
  fs.mkdirSync(batchOut, { recursive: true });
  fs.writeFileSync(
    path.join(batchOut, 'staged-files.json'),
    JSON.stringify({ files: stagedFiles }, null, 2)
  );
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
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const batches = loadBatches();
  const image = requireEnv('ORL_IMAGE');
  const workspaceRoot = requireEnv('GITHUB_WORKSPACE');
  const rulesDir =
    process.env.ORL_RULES_DIR ??
    fs.readFileSync(artifactPath('rules-dir.txt'), 'utf8').trim();
  const actionPath = requireEnv('GITHUB_ACTION_PATH');
  const hooksDir = path.join(actionPath, 'hooks');
  const batchWorkRoot = artifactPath('orl-workspace');
  const scanTimeoutSeconds = envInt('INPUT_SCAN_TIMEOUT_SECONDS', 0);
  const timeoutMs =
    scanTimeoutSeconds > 0 ? scanTimeoutSeconds * 1000 : 0;
  const orlTimeout = (process.env.INPUT_ORL_TIMEOUT ?? '').trim() || undefined;
  const orlRuleTimeout =
    (process.env.INPUT_ORL_RULE_TIMEOUT ?? '').trim() || undefined;
  const concurrency = envInt('ORL_REMEDIATE_CONCURRENCY', 3);
  const mode = (process.env.INPUT_MODE ?? '').trim() || 'audit';

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
        mode,
        orlTimeout,
        orlRuleTimeout,
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

  let summary = '## Gomboc Assessment Results\n\n';
  summary += `| Workspace | Language | Findings | Fixes | Changes |\n`;
  summary += `|-----------|----------|----------|-------|----------|\n`;
  for (const r of results) {
    const t = totalsFromReport(r.report);
    const f = t.findings;
    const fx = t.fixes;
    const c = t.changes;
    summary += `| ${r.workspacePath} | ${r.orlLanguage} | ${f} | ${fx} | ${c} |\n`;
    console.log(
      `Batch ${r.batchId}: exit=${r.exitCode}, spec.findings=${r.report?.spec?.findings ?? 'n/a'}, computed.findings=${f}, rules_applied=${r.report?.spec?.rules_applied ?? 0}, report=${r.report ? 'yes' : 'no'}`
    );
    for (const rule of r.report?.spec?.rules ?? []) {
      const n = countRuleFindings(rule);
      if (n <= 0) continue;
      console.log(`  ${rule.name}: findings=${n}`);
    }
    if (r.exitCode !== 0 && r.error) {
      console.warn(`Batch ${r.batchId} stderr/stdout: ${r.error.slice(0, 500)}`);
    }
  }
  summary += `\n**Totals:** findings=${outcome.mergedReport.spec.findings}, fixes=${outcome.mergedReport.spec.fixes}, changes=${outcome.mergedReport.spec.changes}\n`;
  if (outcome.warnings.length) {
    summary += `\n### Warnings\n${outcome.warnings.map((w) => `- ${w}`).join('\n')}\n`;
    for (const warning of outcome.warnings) {
      appendActionNotice({
        level: 'warning',
        source: 'orl',
        message: warning,
      });
    }
  }
  appendStepSummary(summary);

  const durationInSeconds = Math.max(
    0,
    Math.round((Date.now() - startedAt) / 1000)
  );
  const completedAtIso = new Date().toISOString();
  fs.writeFileSync(
    path.join(getArtifactsRoot(), 'run-complete.json'),
    JSON.stringify(
      {
        ok: !outcome.hadExecutionFailure,
        durationInSeconds,
        startedAt: startedAtIso,
        completedAt: completedAtIso,
      },
      null,
      2
    )
  );

  if (outcome.hadExecutionFailure) {
    throw new Error('One or more ORL remediate batches failed to execute (exit 1)');
  }

  console.log('ORL remediate completed for all batches');
}

runMain(main);
