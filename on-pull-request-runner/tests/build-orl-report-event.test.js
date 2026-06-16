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
      repository: 'gomboc-ai/actions',
      headRepoFullName: 'gomboc-ai/actions',
      isFork: false,
      authorLogin: 'octocat',
    },
    orlReport: {
      type: 'Report',
      version: 'v1',
      metadata: { name: 'merged' },
      workspace: '.',
      language: 'terraform',
      rules_applied: 1,
      findings: 2,
      fixes: 0,
      changes: 0,
      rules: [],
      errors: [],
    },
  });

  assert.equal(body.version, 1);
  assert.equal(body.requestOrigin, 'GITHUB_ACTION');
  assert.equal(body.effect, 'SubmitForReview');
  assert.equal(body.reports.length, 1);
  assert.deepEqual(body.reports[0]?.orlReport?.github, {
    repository: 'gomboc-ai/actions',
    prNumber: 42,
    headSha: 'head',
  });
  assert.equal(body.durationInSeconds, 37);
  assert.deepEqual(body.scmContext, {
    scmType: 'GITHUB',
    originalPullRequest: {
      id: '42',
      url: 'https://github.example.com/gomboc-ai/actions/pull/42',
      author: 'octocat',
    },
  });
});

test('buildCreateOrlReportEventBody includes resultingPullRequest in scmContext', () => {
  const body = buildCreateOrlReportEventBody({
    path: '.',
    branch: 'feature/orl',
    durationInSeconds: 12,
    resultingPullRequest: {
      id: '99',
      url: 'https://github.com/gomboc-ai/actions/pull/99',
      author: 'github-actions[bot]',
    },
    github: {
      number: 42,
      baseSha: 'base',
      headSha: 'head',
      headRef: 'feature/orl',
      repository: 'gomboc-ai/actions',
      headRepoFullName: 'gomboc-ai/actions',
      isFork: false,
      authorLogin: 'octocat',
    },
    orlReport: {
      type: 'Report',
      version: 'v1',
      metadata: { name: 'merged' },
      workspace: '.',
      language: 'terraform',
      rules_applied: 1,
      findings: 0,
      fixes: 1,
      changes: 1,
      rules: [],
      errors: [],
    },
  });

  assert.deepEqual(body.scmContext?.resultingPullRequest, {
    id: '99',
    url: 'https://github.com/gomboc-ai/actions/pull/99',
    author: 'github-actions[bot]',
  });
});
