import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatBatchExitWarning,
  orlRemediateExitExplanation,
} from '../dist/lib/orl-exit-codes.js';

describe('orl-exit-codes', () => {
  it('maps remediate exit codes to human-readable explanations', () => {
    assert.match(
      orlRemediateExitExplanation(2),
      /could not remediate all findings/i
    );
    assert.match(
      orlRemediateExitExplanation(3),
      /errors occurred during remediation/i
    );
    assert.match(
      orlRemediateExitExplanation(1),
      /unrecoverable error/i
    );
  });

  it('formats batch exit warnings without raw exit code jargon', () => {
    const warning = formatBatchExitWarning({
      batchId: 'batch-0',
      workspacePath: 'deploy/terraform/aws',
      orlLanguage: 'terraform',
      exitCode: 2,
    });

    assert.match(warning, /Batch batch-0 \(deploy\/terraform\/aws\/terraform\)/);
    assert.match(warning, /could not remediate all findings/i);
    assert.doesNotMatch(warning, /exited with code/);
  });
});
