import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeBatchResults } from '../dist/lib/merge-orl-results.js';

describe('merge-orl-results', () => {
  it('sums counts across batches', () => {
    const outcome = mergeBatchResults([
      {
        batchId: 'a',
        workspacePath: 'infra',
        orlLanguage: 'terraform',
        exitCode: 0,
        report: {
          metadata: { name: 'r1' },
          spec: {
            rules_applied: 1,
            findings: 2,
            fixes: 1,
            changes: 1,
            rules: [],
            errors: [],
          },
        },
        diagnostics: null,
      },
      {
        batchId: 'b',
        workspacePath: 'apps',
        orlLanguage: 'yaml',
        exitCode: 2,
        report: {
          metadata: { name: 'r2' },
          spec: {
            rules_applied: 1,
            findings: 3,
            fixes: 0,
            changes: 0,
            rules: [],
            errors: [],
          },
        },
        diagnostics: null,
      },
    ]);
    assert.equal(outcome.mergedReport.spec.findings, 5);
    assert.equal(outcome.mergedReport.spec.fixes, 1);
    assert.equal(outcome.hadExecutionFailure, false);
    assert.equal(outcome.warnings.length, 1);
    assert.match(
      outcome.warnings[0],
      /Batch b \(apps\/yaml\): ORL could not remediate all findings/
    );
    assert.doesNotMatch(outcome.warnings[0], /exited with code/);
  });

  it('treats ORL timeout exit 1 as a warning, not a failure', () => {
    const outcome = mergeBatchResults([
      {
        batchId: 'a',
        workspacePath: 'infra',
        orlLanguage: 'terraform',
        exitCode: 1,
        report: {
          metadata: { name: 'r1' },
          spec: {
            rules_applied: 1,
            findings: 1,
            fixes: 0,
            changes: 0,
            rules: [],
            errors: ['context deadline exceeded'],
          },
        },
        diagnostics: null,
      },
    ]);

    assert.equal(outcome.hadExecutionFailure, false);
    assert.equal(outcome.warnings.length, 1);
    assert.match(outcome.warnings[0], /configured timeout was reached/i);
  });

  it('uses rule-level findings when spec findings is 0', () => {
    const outcome = mergeBatchResults([
      {
        batchId: 'a',
        workspacePath: '.',
        orlLanguage: 'terraform',
        exitCode: 0,
        report: {
          metadata: { name: 'r1' },
          spec: {
            rules_applied: 1,
            findings: 0,
            fixes: 0,
            changes: 0,
            rules: [{ name: 'rule-a', findings: 2, fixes: 1, changes: 1 }],
            errors: [],
          },
        },
        diagnostics: null,
      },
    ]);
    assert.equal(outcome.mergedReport.spec.findings, 2);
    assert.equal(outcome.mergedReport.spec.fixes, 1);
  });
});
