import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractAuditCommentCandidates,
  formatInlineCommentBody,
} from '../dist/lib/extract-audit-comments.js';

describe('extract-audit-comments', () => {
  it('anchors findings from finding_locations (ORL report schema)', () => {
    const candidates = extractAuditCommentCandidates({
      batches: [],
      batchReports: [
        {
          batchId: 'batch-0',
          workspacePath: '.',
          report: {
            metadata: { name: 'r' },
            spec: {
              rules_applied: 1,
              findings: 1,
              fixes: 1,
              changes: 1,
              rules: [
                {
                  name: 'orl-rule:uniform-bucket-level-access',
                  metadata: {
                    name: 'orl-rule:uniform-bucket-level-access',
                    display_name: 'Ensure uniform bucket-level access',
                    annotations: {
                      'gomboc-ai/risk/score': 'Medium',
                      'gomboc-ai/severity/score': 'High',
                    },
                  },
                  findings: 1,
                  finding_locations: [
                    {
                      id: 'finding-1',
                      resolved_location: {
                        id: 'loc-1',
                        file_path: 'main.tf',
                        start_line: 12,
                        start_column: 0,
                        end_line: 14,
                      },
                    },
                  ],
                },
              ],
              errors: [],
            },
          },
        },
      ],
      batchDiagnostics: [{ batchId: 'batch-0', diagnostics: null }],
      prScannableFiles: new Set(['main.tf']),
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].filePath, 'main.tf');
    assert.equal(candidates[0].line, 12);
    assert.equal(candidates[0].endLine, 14);
    assert.equal(candidates[0].severity, 'High');
    assert.equal(candidates[0].risk, 'Medium');
    assert.match(formatInlineCommentBody(candidates[0]), /Medium/);
  });

  it('anchors findings from files_changed line on PR-scannable paths', () => {
    const candidates = extractAuditCommentCandidates({
      batches: [],
      batchReports: [
        {
          batchId: 'batch-0',
          workspacePath: '.',
          report: {
            metadata: { name: 'r' },
            spec: {
              rules_applied: 1,
              findings: 1,
              fixes: 1,
              changes: 1,
              rules: [
                {
                  name: 'orl-rule:test',
                  metadata: {
                    name: 'orl-rule:test',
                    display_name: 'Test rule',
                    annotations: { severity: 'High', risk: 'Medium' },
                  },
                  findings: 1,
                  files_changed: { 'main.tf': { line: 12 } },
                },
              ],
              errors: [],
            },
          },
        },
      ],
      batchDiagnostics: [{ batchId: 'batch-0', diagnostics: null }],
      prScannableFiles: new Set(['main.tf']),
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].line, 12);
  });

  it('skips files outside PR scannable set', () => {
    const candidates = extractAuditCommentCandidates({
      batches: [],
      batchReports: [
        {
          batchId: 'batch-0',
          workspacePath: 'infra',
          report: {
            metadata: { name: 'r' },
            spec: {
              rules_applied: 1,
              findings: 1,
              fixes: 0,
              changes: 0,
              rules: [
                {
                  name: 'orl-rule:test',
                  metadata: { name: 'orl-rule:test' },
                  findings: 1,
                  finding_locations: [
                    {
                      id: 'f1',
                      original_location: {
                        id: 'l1',
                        file_path: 'vpc.tf',
                        start_line: 3,
                        start_column: 0,
                      },
                    },
                  ],
                },
              ],
              errors: [],
            },
          },
        },
      ],
      batchDiagnostics: [{ batchId: 'batch-0', diagnostics: null }],
      prScannableFiles: new Set(['infra/main.tf']),
    });

    assert.equal(candidates.length, 0);
  });

  it('joins workspace-relative report paths', () => {
    const candidates = extractAuditCommentCandidates({
      batches: [],
      batchReports: [
        {
          batchId: 'batch-0',
          workspacePath: 'infra',
          report: {
            metadata: { name: 'r' },
            spec: {
              rules_applied: 1,
              findings: 1,
              fixes: 1,
              changes: 1,
              rules: [
                {
                  name: 'orl-rule:test',
                  metadata: { name: 'orl-rule:test' },
                  findings: 1,
                  finding_locations: [
                    {
                      id: 'f1',
                      original_location: {
                        id: 'l1',
                        file_path: 'main.tf',
                        start_line: 5,
                        start_column: 0,
                      },
                    },
                  ],
                },
              ],
              errors: [],
            },
          },
        },
      ],
      batchDiagnostics: [{ batchId: 'batch-0', diagnostics: null }],
      prScannableFiles: new Set(['infra/main.tf']),
    });

    assert.equal(candidates[0].filePath, 'infra/main.tf');
  });

  it('falls back to git diff lines when report path has no line', () => {
    const candidates = extractAuditCommentCandidates({
      batches: [],
      batchReports: [
        {
          batchId: 'batch-0',
          workspacePath: '.',
          report: {
            metadata: { name: 'r' },
            spec: {
              rules_applied: 1,
              findings: 1,
              fixes: 0,
              changes: 0,
              rules: [
                {
                  name: 'orl-rule:test',
                  metadata: { name: 'orl-rule:test' },
                  findings: 1,
                  paths_with_findings: { 'main.tf': {} },
                },
              ],
              errors: [],
            },
          },
        },
      ],
      batchDiagnostics: [{ batchId: 'batch-0', diagnostics: null }],
      prScannableFiles: new Set(['main.tf']),
      diffChangedLines: new Map([['main.tf', [7, 8, 9]]]),
    });

    assert.equal(candidates[0].line, 7);
  });
});
