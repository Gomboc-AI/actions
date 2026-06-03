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
                      'gomboc-ai/impact/score': 'high',
                      'gomboc-ai/impact/statement-plain':
                        'Simplifies access control by enforcing IAM-based permissions.',
                      'gomboc-ai/risk/score': 'medium',
                      'gomboc-ai/risk/statement-plain':
                        'Applications relying on ACLs will immediately lose access.',
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
    assert.equal(candidates[0].impact, 'high');
    assert.equal(candidates[0].risk, 'medium');
    const body = formatInlineCommentBody(candidates[0]);
    assert.match(body, /## Severity: `HIGH`/);
    assert.match(body, /## Risk: `MEDIUM`/);
    assert.match(body, /IAM-based permissions/);
    assert.match(body, /lose access/);
    assert.doesNotMatch(body, /<table>/);
  });

  it('links rule name to portal ruleset page', () => {
    const candidate = {
      dedupeKey: 'k',
      ruleName:
        'gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled001',
      displayName: 'Ensure Storage Bucket uniform bucket-level access is enabled',
      description:
        '## Description\n\nEnables uniform bucket-level access for GCP Storage Buckets.',
      risk: 'medium',
      filePath: 'main.tf',
      line: 12,
    };

    const body = formatInlineCommentBody(candidate, {
      portalServiceUrl: 'https://app.gomboc.ai',
    });

    assert.match(
      body,
      /\[gomboc-ai\/ensure-storage-bucket-uniform-bucket-level-access-is-enabled001\]\(https:\/\/app\.gomboc\.ai\/data-library\/rules\/gomboc-ai\/ensure-storage-bucket-uniform-bucket-level-access-is-enabled\)/
    );
    assert.match(body, /## Description/);
    assert.doesNotMatch(body, /## Description\n\n## Description/);
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
