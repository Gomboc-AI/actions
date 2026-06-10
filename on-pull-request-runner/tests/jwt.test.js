import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tenantIdFromToken } from '../dist/lib/jwt.js';

describe('jwt', () => {
  it('decodes tenantId from payload', () => {
    const payload = Buffer.from(JSON.stringify({ tenantId: 'acme' })).toString(
      'base64url'
    );
    const token = `hdr.${payload}.sig`;
    assert.equal(tenantIdFromToken(token), 'acme');
  });

  it('returns null for invalid token', () => {
    assert.equal(tenantIdFromToken('not-a-jwt'), null);
  });
});
