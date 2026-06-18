import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildChannelCandidates,
  DEFAULT_CHANNEL_NAME,
} from '../dist/lib/resolve-rules-channel.js';

describe('resolve-rules-channel', () => {
  it('buildChannelCandidates uses gbw fallback order without workspace channel', () => {
    const accountId = 'acme-tenant';
    assert.deepEqual(buildChannelCandidates(accountId), [
      'acme-tenant/accounts/global',
      'acme-tenant/set/default',
      'acme-tenant/accounts/default',
      DEFAULT_CHANNEL_NAME,
    ]);
  });
});
