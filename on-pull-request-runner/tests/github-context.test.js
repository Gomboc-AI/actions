import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScmPullRequestRef } from '../dist/lib/github-context.js';

test('parseScmPullRequestRef accepts valid remediation PR refs', () => {
  assert.deepEqual(
    parseScmPullRequestRef({
      id: '99',
      url: 'https://github.com/gomboc-ai/actions/pull/99',
      author: 'github-actions[bot]',
    }),
    {
      id: '99',
      url: 'https://github.com/gomboc-ai/actions/pull/99',
      author: 'github-actions[bot]',
    }
  );
});

test('parseScmPullRequestRef rejects incomplete refs', () => {
  assert.equal(parseScmPullRequestRef(null), undefined);
  assert.equal(parseScmPullRequestRef({ id: '99', url: 'https://example.com' }), undefined);
  assert.equal(parseScmPullRequestRef({ id: '', url: 'https://example.com', author: 'bot' }), undefined);
});
