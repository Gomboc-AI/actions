import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IntegrationsApiError,
  normalizeIntegrationsBaseUrl,
} from '../dist/lib/clients/integrations-client.js';

test('normalizeIntegrationsBaseUrl strips trailing slash', () => {
  assert.equal(
    normalizeIntegrationsBaseUrl('https://integrations.app.gomboc.ai/'),
    'https://integrations.app.gomboc.ai'
  );
  assert.equal(
    normalizeIntegrationsBaseUrl('https://integrations.app.gomboc.ai'),
    'https://integrations.app.gomboc.ai'
  );
});

test('IntegrationsApiError exposes status and body', () => {
  const err = new IntegrationsApiError('failed', 401, '{"error":"unauthorized"}');
  assert.equal(err.name, 'IntegrationsApiError');
  assert.equal(err.status, 401);
  assert.equal(err.body, '{"error":"unauthorized"}');
  assert.match(err.message, /failed/);
});
