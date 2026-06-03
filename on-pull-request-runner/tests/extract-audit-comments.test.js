import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractAuditCommentCandidates,
  formatInlineCommentBody,
} from '../dist/lib/extract-audit-comments.js';

describe('extract-audit-comments', () => {
  it('anchors findings from files_changed line on PR-scannable paths', () => {
    const candidates = extractAuditCommentCandidates({
      batches: [
        {
          batchId: 'batch-0',
          workspacePath: '.',
          orlLanguage: 'terraform',
          files: ['main.tf'],
        },
      ],
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
    assert.equal(candidates[0].filePath, 'main.tf');
    assert.equal(candidates[0].line, 12);
    assert.equal(candidates[0].severity, 'High');
    assert.equal(candidates[0].risk, 'Medium');
    assert.match(formatInlineCommentBody(candidates[0]), /High/);
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
                  files_changed: { 'vpc.tf': { startLine: 3 } },
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
                  files_changed: { 'main.tf': { line: 5 } },
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

  it('falls back to diagnostics when report has no line', () => {
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
      batchDiagnostics: [
        {
          batchId: 'batch-0',
          diagnostics: {
            version: 1,
            rules: [
              {
                ruleName: 'orl-rule:test',
                files: [
                  {
                    path: 'main.tf',
                    hunks: [{ startLine: 8, lineCount: 2 }],
                  },
                ],
              },
            ],
          },
        },
      ],
      prScannableFiles: new Set(['main.tf']),
    });

    assert.equal(candidates[0].line, 8);
  });
});
