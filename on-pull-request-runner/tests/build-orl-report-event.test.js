import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCreateOrlReportEventBody } from '../dist/lib/build-orl-report-event.js';

test('buildCreateOrlReportEventBody returns SDK-typed payload with GitHub context on orlReport', () => {
  process.env.GITHUB_SERVER_URL = 'https://github.example.com';

  const body = buildCreateOrlReportEventBody({
    path: '.',
    branch: 'feature/orl',
    durationInSeconds: 37,
    github: {
      number: 42,
      baseSha: 'base',
      headSha: 'head',
      headRef: 'feature/orl',
      baseRef: 'main',
      repository: 'gomboc-ai/actions',
      repositoryId: 'repo-1',
      repositoryName: 'actions',
      ownerId: 'owner-1',
      ownerName: 'gomboc-ai',
      headRepoFullName: 'gomboc-ai/actions',
      isFork: false,
      title: 'Apply ORL fixes',
      htmlUrl: 'https://github.example.com/gomboc-ai/actions/pull/42',
      state: 'OPEN',
      authorLogin: 'octocat',
    },
    gitDiffs: {
      'main.tf': 'diff --git a/main.tf b/main.tf',
    },
    remediatedFileContent: {
      'main.tf': 'resource "aws_s3_bucket" "ok" {}',
    },
    workflowStatus: { status: 'success', errors: [] },
    timing: {
      startedAt: '2026-07-01T09:59:00.000Z',
      completedAt: '2026-07-01T10:00:00.000Z',
    },
    orlReport: {
      type: 'Report',
      version: 'v1',
      metadata: { name: 'merged' },
      spec: {
        workspace: '.',
        language: 'terraform',
        rules_applied: 1,
        findings: 2,
        fixes: 0,
        changes: 0,
        rules: [
          {
            name: 'orl-rule:s3',
            findings: 2,
            metadata: {
              description: 'raw rule metadata should be preserved',
            },
          },
        ],
        errors: [],
      },
    },
  });

  assert.equal(body.version, 2);
  assert.equal(body.requestOrigin, 'GITHUB_ACTION');
  assert.equal(body.effect, 'SubmitForReview');
  assert.equal(body.reports.length, 1);
  assert.deepEqual(body.reports[0]?.orlReport?.github, {
    repository: 'gomboc-ai/actions',
    prNumber: 42,
    headSha: 'head',
  });
  assert.equal(body.reports[0]?.orlReport?.type, 'Report');
  assert.equal(body.reports[0]?.orlReport?.version, 'v1');
  assert.deepEqual(body.reports[0]?.orlReport?.spec?.rules, [
    {
      name: 'orl-rule:s3',
      findings: 2,
      metadata: {
        description: 'raw rule metadata should be preserved',
      },
    },
  ]);
  assert.equal(body.durationInSeconds, 37);
  assert.deepEqual(body.gitDiffs, {
    'main.tf': 'diff --git a/main.tf b/main.tf',
  });
  assert.deepEqual(body.remediatedFileContent, {
    'main.tf': 'resource "aws_s3_bucket" "ok" {}',
  });
  assert.deepEqual(body.workflowStatus, { status: 'success', errors: [] });
  assert.deepEqual(body.timing, {
    startedAt: '2026-07-01T09:59:00.000Z',
    completedAt: '2026-07-01T10:00:00.000Z',
  });
  assert.deepEqual(body.scmContext, {
    scmType: 'GITHUB',
    originalPullRequest: {
      pullRequest: {
        repositoryId: 'repo-1',
        repositoryName: 'actions',
        ownerId: 'owner-1',
        ownerName: 'gomboc-ai',
        number: '42',
        url: 'https://github.example.com/gomboc-ai/actions/pull/42',
        title: 'Apply ORL fixes',
        sourceBranch: 'feature/orl',
        targetBranch: 'main',
        status: 'OPEN',
        provider: 'GitHub',
        authoredByGomboc: false,
      },
      branchCommit: {
        sha: 'head',
        branchName: 'feature/orl',
      },
    },
  });
});

test('buildCreateOrlReportEventBody includes resultingPullRequest in scmContext', () => {
  const body = buildCreateOrlReportEventBody({
    path: '.',
    branch: 'feature/orl',
    durationInSeconds: 12,
    resultingPullRequest: {
      repositoryId: 'repo-1',
      repositoryName: 'actions',
      ownerId: 'owner-1',
      ownerName: 'gomboc-ai',
      number: '99',
      url: 'https://github.com/gomboc-ai/actions/pull/99',
      title: 'chore(gomboc): ORL remediation for PR #42',
      sourceBranch: 'gomboc/orl-remediation-42',
      targetBranch: 'feature/orl',
      status: 'OPEN',
      provider: 'GitHub',
    },
    github: {
      number: 42,
      baseSha: 'base',
      headSha: 'head',
      headRef: 'feature/orl',
      baseRef: 'main',
      repository: 'gomboc-ai/actions',
      repositoryId: 'repo-1',
      repositoryName: 'actions',
      ownerId: 'owner-1',
      ownerName: 'gomboc-ai',
      headRepoFullName: 'gomboc-ai/actions',
      isFork: false,
      title: 'Apply ORL fixes',
      htmlUrl: 'https://github.com/gomboc-ai/actions/pull/42',
      state: 'OPEN',
      authorLogin: 'octocat',
    },
    workflowStatus: { status: 'success', errors: [] },
    orlReport: {
      type: 'Report',
      version: 'v1',
      metadata: { name: 'merged' },
      spec: {
        workspace: '.',
        language: 'terraform',
        rules_applied: 1,
        findings: 0,
        fixes: 1,
        changes: 1,
        rules: [],
        errors: [],
      },
    },
  });

  assert.deepEqual(body.scmContext?.resultingPullRequest, {
    repositoryId: 'repo-1',
    repositoryName: 'actions',
    ownerId: 'owner-1',
    ownerName: 'gomboc-ai',
    number: '99',
    url: 'https://github.com/gomboc-ai/actions/pull/99',
    title: 'chore(gomboc): ORL remediation for PR #42',
    sourceBranch: 'gomboc/orl-remediation-42',
    targetBranch: 'feature/orl',
    status: 'OPEN',
    provider: 'GitHub',
  });
});
