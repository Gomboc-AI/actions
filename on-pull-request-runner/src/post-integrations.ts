/**
 * Composite step: POST normalized scan payload to Gomboc Integrations (non-blocking on failure).
 */
import fs from 'node:fs';
import path from 'node:path';
import { initIntegrationsServiceSdk } from '@gomboc-ai/gomboc-node-sdk';
import yaml from 'yaml';
import { artifactPath } from './lib/artifacts.js';
import {
  appendActionNotice,
  integrationsErrorMessage,
} from './lib/action-notices.js';
import { buildCreateOrlReportEventBody } from './lib/build-orl-report-event.js';
import { envBool, requireEnv } from './lib/env.js';
import { appendStepSummary } from './lib/github-output.js';
import {
  loadPullRequestContext,
  parseScmPullRequestRef,
  type ScmPullRequestRef,
} from './lib/github-context.js';
import { gitDiffForPath } from './lib/git.js';
import { tenantIdFromToken } from './lib/jwt.js';
import type { IntegrationsOrlReport } from './types.js';
import { runMain } from './lib/runner.js';

type RunComplete = {
  ok?: boolean;
  durationInSeconds?: number;
  startedAt?: string;
  completedAt?: string;
};

type WorkflowStatus = { status: 'success' | 'failure'; errors: string[] };

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function loadResultingPullRequest(): ScmPullRequestRef | undefined {
  const mode = (process.env.INPUT_MODE ?? '').trim();
  if (mode !== 'remediate') return undefined;

  const remediationPrPath = artifactPath('remediation-pr.json');
  if (!fs.existsSync(remediationPrPath)) return undefined;

  const parsed = parseScmPullRequestRef(
    JSON.parse(fs.readFileSync(remediationPrPath, 'utf8'))
  );
  if (!parsed) {
    console.warn(
      'remediation-pr.json is present but invalid; omitting resultingPullRequest'
    );
  }
  return parsed;
}

function loadScannableFiles(): string[] {
  const file = artifactPath('pr-scannable-files.json');
  if (!fs.existsSync(file)) return [];
  const raw = loadJson<{ files?: string[] }>(file);
  return [...new Set(raw.files ?? [])].sort();
}

function nonEmptyRecord(record: Record<string, string>): Record<string, string> | undefined {
  return Object.keys(record).length ? record : undefined;
}

function collectGitDiffs(args: {
  baseSha: string;
  headSha: string;
  workspaceRoot: string;
  files: string[];
}): Record<string, string> | undefined {
  const diffs: Record<string, string> = {};
  for (const file of args.files) {
    try {
      const diff = gitDiffForPath({
        baseSha: args.baseSha,
        headSha: args.headSha,
        cwd: args.workspaceRoot,
        path: file,
      });
      if (diff) diffs[file] = diff;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Could not collect git diff for ${file}: ${message}`);
    }
  }
  return nonEmptyRecord(diffs);
}

function collectRemediatedFileContent(args: {
  mode: string;
  workspaceRoot: string;
  files: string[];
}): Record<string, string> | undefined {
  if (args.mode !== 'remediate') return undefined;

  const contents: Record<string, string> = {};
  for (const file of args.files) {
    const abs = path.join(args.workspaceRoot, file);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    try {
      contents[file] = fs.readFileSync(abs, 'utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Could not collect remediated content for ${file}: ${message}`);
    }
  }
  return nonEmptyRecord(contents);
}

async function main(): Promise<void> {
  if (!envBool('INPUT_INTEGRATIONS_ENABLED', true)) {
    console.log('Integrations disabled; skipping POST');
    return;
  }

  const token = requireEnv('GOMBOC_ACCESS_TOKEN');
  const accountId = tenantIdFromToken(token);
  if (!accountId) {
    const message =
      'GOMBOC_ACCESS_TOKEN is missing tenantId; cannot initialize Integrations SDK';
    appendActionNotice({ level: 'error', source: 'integrations', message });
    appendStepSummary(`### Integrations warning\n\n${message}\n`);
    console.warn(message);
    return;
  }

  const pr = loadPullRequestContext();
  const workspaceRoot = requireEnv('GITHUB_WORKSPACE');
  const mode = (process.env.INPUT_MODE ?? '').trim();
  const orlReport = yaml.parse(
    fs.readFileSync(artifactPath('merged-report.yaml'), 'utf8')
  ) as IntegrationsOrlReport;

  const batches = loadJson<{ batches: Array<{ workspacePath: string }> }>(
    artifactPath('evaluation-batches.json')
  );

  const paths = [...new Set(batches.batches.map((b) => b.workspacePath))];
  const reportPath = paths.length === 1 ? paths[0] : '.';

  const runComplete = loadJson<RunComplete>(artifactPath('run-complete.json'));
  const durationInSeconds = runComplete.durationInSeconds;
  if (typeof durationInSeconds !== 'number' || durationInSeconds < 0) {
    throw new Error(
      'run-complete.json is missing durationInSeconds; cannot POST to Integrations'
    );
  }

  const resultingPullRequest = loadResultingPullRequest();
  const scannableFiles = loadScannableFiles();
  const workflowStatus: WorkflowStatus = {
    status: runComplete.ok === false ? 'failure' : 'success',
    errors: runComplete.ok === false ? ['ORL run completed with failures'] : [],
  };
  const timing = {
    startedAt: runComplete.startedAt,
    completedAt: runComplete.completedAt,
  };

  const body = buildCreateOrlReportEventBody({
    orlReport,
    path: reportPath,
    branch: pr.headRef || process.env.GITHUB_REF_NAME || '',
    github: pr,
    durationInSeconds,
    resultingPullRequest,
    gitDiffs: collectGitDiffs({
      baseSha: pr.baseSha,
      headSha: pr.headSha,
      workspaceRoot,
      files: scannableFiles,
    }),
    remediatedFileContent: collectRemediatedFileContent({
      mode,
      workspaceRoot,
      files: scannableFiles,
    }),
    workflowStatus,
    timing,
  });

  const sdk = await initIntegrationsServiceSdk({
    accessToken: token,
    accountId,
    baseUrl: requireEnv('INTEGRATIONS_SERVICE_URL').replace(/\/$/, ''),
    logger: console,
  });

  const result = await sdk.createOrlReportEventV2(body);

  if (result.isOk()) {
    console.log('Integrations POST succeeded');
    return;
  }

  const error = result.error;
  const status = error.statusCode ?? 400;
  const responseBody = JSON.stringify({ error });
  const message = integrationsErrorMessage(status, responseBody);

  appendActionNotice({
    level: status === 401 || status === 403 ? 'error' : 'warning',
    source: 'integrations',
    status,
    message,
  });
  appendStepSummary(
    `### Integrations warning\n\nPOST failed (${status}): ${responseBody.slice(0, 500)}\n`
  );
  console.warn(`Integrations POST failed: ${status} ${responseBody}`);
}

runMain(main);
