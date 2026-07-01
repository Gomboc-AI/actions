import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScmPullRequestRef } from '../dist/lib/github-context.js';

test('parseScmPullRequestRef accepts valid remediation PR refs', () => {
  assert.deepEqual(
    parseScmPullRequestRef({
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
    }),
    {
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
    }
  );
});

test('parseScmPullRequestRef rejects incomplete refs', () => {
  assert.equal(parseScmPullRequestRef(null), undefined);
  assert.equal(
    parseScmPullRequestRef({ number: '99', url: 'https://example.com' }),
    undefined
  );
  assert.equal(
    parseScmPullRequestRef({
      repositoryId: 'repo-1',
      repositoryName: 'actions',
      ownerId: 'owner-1',
      ownerName: 'gomboc-ai',
      number: '',
      url: 'https://example.com',
      title: 'Remediate',
      sourceBranch: 'bot',
      targetBranch: 'feature',
      status: 'OPEN',
      provider: 'GitHub',
    }),
    undefined
  );
});
