import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendActionNotice,
  formatActionNoticesSection,
  hasAuthFailureNotices,
  hasErrorNotices,
  integrationsErrorMessage,
  loadActionNotices,
} from '../dist/lib/action-notices.js';

describe('action-notices', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomboc-notices-'));
    process.env.RUNNER_TEMP = tempDir;
  });

  afterEach(() => {
    delete process.env.RUNNER_TEMP;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists and loads notices', () => {
    appendActionNotice({
      level: 'error',
      source: 'integrations',
      status: 401,
      message: 'Authentication failed',
    });
    const notices = loadActionNotices();
    assert.equal(notices.length, 1);
    assert.equal(notices[0].status, 401);
  });

  it('detects auth failure notices', () => {
    const notices = [
      {
        level: 'error',
        source: 'integrations',
        status: 401,
        message: 'Authentication failed',
      },
    ];
    assert.equal(hasErrorNotices(notices), true);
    assert.equal(hasAuthFailureNotices(notices), true);
  });

  it('formats auth error section for PR summary', () => {
    const lines = formatActionNoticesSection([
      {
        level: 'error',
        source: 'integrations',
        status: 401,
        message: 'Authentication failed',
      },
    ]);
    const body = lines.join('\n');
    assert.match(body, /### Action errors/);
    assert.match(body, /Authentication failed/);
    assert.match(body, /GOMBOC_ACCESS_TOKEN/);
    assert.match(body, /\*\*integrations\*\* \(401\)/);
  });

  it('parses integrations JSON error body', () => {
    const msg = integrationsErrorMessage(
      401,
      JSON.stringify({ status: 'error', error: { message: 'Authentication failed' } })
    );
    assert.equal(msg, 'Authentication failed');
  });
});
