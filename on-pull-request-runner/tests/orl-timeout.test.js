import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatBatchTimeoutWarning,
  isOrlTimeoutResult,
} from '../dist/lib/orl-timeout.js';

describe('orl-timeout', () => {
  it('detects timeout messages in stderr', () => {
    assert.equal(
      isOrlTimeoutResult({
        error: 'context deadline exceeded while remediating',
        report: null,
      }),
      true
    );
  });

  it('detects timeout messages in report errors', () => {
    assert.equal(
      isOrlTimeoutResult({
        report: {
          metadata: { name: 'r1' },
          spec: {
            rules_applied: 0,
            findings: 0,
            fixes: 0,
            changes: 0,
            rules: [],
            errors: ['remediation timeout reached'],
          },
        },
      }),
      true
    );
  });

  it('does not treat unrelated failures as timeout', () => {
    assert.equal(
      isOrlTimeoutResult({
        error: 'failed to load rulespace',
        report: null,
      }),
      false
    );
  });

  it('formats timeout warnings without raw exit code jargon', () => {
    const warning = formatBatchTimeoutWarning({
      batchId: 'batch-0',
      workspacePath: 'infra',
      orlLanguage: 'terraform',
    });

    assert.match(warning, /Batch batch-0 \(infra\/terraform\)/);
    assert.match(warning, /configured timeout was reached/i);
    assert.doesNotMatch(warning, /exited with code/);
  });
});
