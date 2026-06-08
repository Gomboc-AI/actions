import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  capAuditCommentCandidates,
  extractAuditCommentCandidates,
  formatInlineCommentBody,
} from '../dist/lib/extract-audit-comments.js';

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/diagnostics'
);

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
    assert.match(body, /<!-- gomboc-orl-audit key=/);
    assert.match(body, /### Severity: `HIGH`/);
    assert.match(body, /### Risk: `MEDIUM`/);
    assert.match(body, /IAM-based permissions/);
    assert.match(body, /lose access/);
    assert.doesNotMatch(body, /<table>/);
    assert.doesNotMatch(body, /<details>/);
    assert.doesNotMatch(body, /\[Read more\]/);
    assert.ok(body.indexOf('### Ensure uniform') < body.indexOf('### Severity'));
  });

  it('appends inline Read more link to rule description', () => {
    const candidate = {
      dedupeKey: 'k',
      ruleName:
        'gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled001',
      displayName: 'Ensure Storage Bucket uniform bucket-level access is enabled',
      description:
        '## Description\n\nEnables uniform bucket-level access for GCP Storage Buckets.',
      impact: 'high',
      impactStatement: 'Simplifies access control.',
      risk: 'medium',
      riskStatement: 'This disables object-level ACLs.',
      filePath: 'main.tf',
      line: 12,
    };

    const body = formatInlineCommentBody(candidate, {
      portalServiceUrl: 'https://app.gomboc.ai',
    });

    assert.match(
      body,
      /Enables uniform bucket-level access for GCP Storage Buckets\. \[Read more\]\(https:\/\/app\.gomboc\.ai\/data-library\/rules\/gomboc-ai\/ensure-storage-bucket-uniform-bucket-level-access-is-enabled\)/
    );
    assert.match(body, /### Ensure Storage Bucket uniform bucket-level access is enabled/);
    assert.doesNotMatch(body, /## Description/);
    assert.doesNotMatch(body, /gomboc-ai\/ensure-storage-bucket-uniform-bucket-level-access-is-enabled001\]/);
    assert.ok(body.indexOf('[Read more]') < body.indexOf('### Severity'));
    assert.doesNotMatch(body, /<details>/);
    assert.match(body, /### Severity: `HIGH`\n\nSimplifies access control\./);
    assert.match(body, /### Risk: `MEDIUM`\n\nThis disables object-level ACLs\./);
  });

  it('demotes remaining ## headings to #### in rule description', () => {
    const candidate = {
      dedupeKey: 'k',
      ruleName: 'gomboc-ai/some-rule',
      displayName: 'Some rule',
      description:
        '## Description\n\nMain text.\n\n## Impact\n\nLarge blast radius.',
      impact: 'high',
      impactStatement: 'Simplifies access control.',
      risk: 'medium',
      riskStatement: 'This disables object-level ACLs.',
      filePath: 'main.tf',
      line: 12,
    };

    const body = formatInlineCommentBody(candidate);

    assert.match(body, /Main text\.\n\n#### Impact\n\nLarge blast radius\./);
    assert.doesNotMatch(body, /^## Impact/m);
    assert.doesNotMatch(body, /## Description/);
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

  it('anchors findings from diagnostics.json hunks when report has no line', () => {
    const diagnostics = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'sample.json'), 'utf8')
    );

    const candidates = extractAuditCommentCandidates({
      batches: [{ batchId: 'batch-0', workspacePath: '.', orlLanguage: 'terraform', files: ['main.tf'] }],
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
                  name: 'orl-rule:uniform-bucket-level-access',
                  metadata: { name: 'orl-rule:uniform-bucket-level-access' },
                  findings: 1,
                  paths_with_findings: { 'main.tf': {} },
                },
              ],
              errors: [],
            },
          },
        },
      ],
      batchDiagnostics: [{ batchId: 'batch-0', diagnostics }],
      prScannableFiles: new Set(['main.tf']),
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].filePath, 'main.tf');
    assert.equal(candidates[0].line, 12);
    assert.equal(candidates[0].startLine, 12);
  });

  it('anchors findings from diagnostics.json resources when hunks are absent', () => {
    const diagnostics = {
      version: 1,
      rules: [
        {
          ruleName: 'orl-rule:test',
          files: [
            {
              path: 'template.yaml',
              resources: [{ startLine: 10, endLine: 15 }],
            },
          ],
        },
      ],
    };

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
                  paths_with_findings: { 'template.yaml': {} },
                },
              ],
              errors: [],
            },
          },
        },
      ],
      batchDiagnostics: [{ batchId: 'batch-0', diagnostics }],
      prScannableFiles: new Set(['template.yaml']),
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].filePath, 'template.yaml');
    assert.equal(candidates[0].line, 10);
    assert.equal(candidates[0].endLine, 15);
  });

  it('does not duplicate comments when finding_locations and paths_with_findings overlap', () => {
    const candidates = extractAuditCommentCandidates({
      batches: [],
      batchReports: [
        {
          batchId: 'batch-0',
          workspacePath: 'deploy/terraform/aws',
          report: {
            metadata: { name: 'r' },
            spec: {
              rules_applied: 1,
              findings: 2,
              fixes: 2,
              changes: 2,
              rules: [
                {
                  name: 'orl-rule:ec2-public-ip',
                  metadata: { name: 'orl-rule:ec2-public-ip' },
                  findings: 2,
                  finding_locations: [
                    {
                      id: 'f1',
                      resolved_location: {
                        id: 'l1',
                        file_path: 'network-main.tf',
                        start_line: 10,
                        start_column: 0,
                      },
                    },
                    {
                      id: 'f2',
                      resolved_location: {
                        id: 'l2',
                        file_path: 'network-main.tf',
                        start_line: 20,
                        start_column: 0,
                      },
                    },
                  ],
                  paths_with_findings: { 'network-main.tf': { line: 10 } },
                  files_changed: { 'network-main.tf': { line: 10 } },
                },
              ],
              errors: [],
            },
          },
        },
      ],
      batchDiagnostics: [{ batchId: 'batch-0', diagnostics: null }],
      prScannableFiles: new Set(['deploy/terraform/aws/network-main.tf']),
      diffChangedLines: new Map([
        ['deploy/terraform/aws/network-main.tf', [10, 20]],
      ]),
    });

    assert.equal(candidates.length, 2);
    assert.equal(
      candidates[0].dedupeKey,
      'orl-rule:ec2-public-ip:deploy/terraform/aws/network-main.tf:10'
    );
  });

  it('caps candidates to each rule finding count and report total', () => {
    const rule = {
      name: 'orl-rule:ec2-public-ip',
      metadata: { name: 'orl-rule:ec2-public-ip' },
      findings: 2,
      finding_locations: [
        {
          id: 'f1',
          resolved_location: {
            id: 'l1',
            file_path: 'network-main.tf',
            start_line: 10,
            start_column: 0,
          },
        },
        {
          id: 'f2',
          resolved_location: {
            id: 'l2',
            file_path: 'network-main.tf',
            start_line: 20,
            start_column: 0,
          },
        },
        {
          id: 'f3',
          resolved_location: {
            id: 'l3',
            file_path: 'network-main.tf',
            start_line: 30,
            start_column: 0,
          },
        },
        {
          id: 'f4',
          resolved_location: {
            id: 'l4',
            file_path: 'network-main.tf',
            start_line: 40,
            start_column: 0,
          },
        },
      ],
    };

    const raw = extractAuditCommentCandidates({
      batches: [],
      batchReports: [
        {
          batchId: 'batch-0',
          workspacePath: 'deploy/terraform/aws',
          report: {
            metadata: { name: 'r' },
            spec: {
              rules_applied: 1,
              findings: 2,
              fixes: 0,
              changes: 0,
              rules: [rule],
              errors: [],
            },
          },
        },
      ],
      batchDiagnostics: [{ batchId: 'batch-0', diagnostics: null }],
      prScannableFiles: new Set(['deploy/terraform/aws/network-main.tf']),
    });

    assert.equal(raw.length, 4);

    const capped = capAuditCommentCandidates({
      candidates: raw,
      rules: [rule],
      totalFindingsCap: 2,
    });

    assert.equal(capped.length, 2);
    assert.deepEqual(
      capped.map((c) => c.line),
      [10, 20]
    );
  });
});
