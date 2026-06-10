import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOwnerRepo } from '../dist/lib/github-client.js';

test('parseOwnerRepo splits owner and repo', () => {
  assert.deepEqual(parseOwnerRepo('gomboc-ai/actions'), {
    owner: 'gomboc-ai',
    repo: 'actions',
  });
});

test('parseOwnerRepo rejects invalid repository', () => {
  assert.throws(() => parseOwnerRepo('no-slash'), /Invalid GITHUB_REPOSITORY/);
});
