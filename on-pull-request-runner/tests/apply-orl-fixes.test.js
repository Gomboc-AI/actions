import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyOrlFixes,
  pathsFromReport,
  pathsWithChangesFromReport,
} from '../dist/lib/apply-orl-fixes.js';

describe('apply-orl-fixes', () => {
  it('collects paths from report files_changed and paths_with_findings (legacy)', () => {
    const paths = pathsFromReport({
      metadata: { name: 'r' },
      spec: {
        rules_applied: 1,
        findings: 1,
        fixes: 1,
        changes: 1,
        rules: [
          {
            name: 'orl-rule:a',
            files_changed: { 'infra/main.tf': {} },
            paths_with_findings: { 'k8s/deployment.yaml': {} },
          },
        ],
        errors: [],
      },
    });

    assert.deepEqual(paths, ['infra/main.tf', 'k8s/deployment.yaml']);
  });

  it('pathsWithChangesFromReport uses files_changed and joins workspace-relative paths', () => {
    const paths = pathsWithChangesFromReport(
      {
        metadata: { name: 'r' },
        spec: {
          rules_applied: 1,
          findings: 1,
          fixes: 1,
          changes: 1,
          rules: [
            {
              name: 'orl-rule:a',
              files_changed: { 'main.tf': {} },
              paths_with_findings: { 'other.tf': {} },
            },
          ],
          errors: [],
        },
      },
      'deploy/terraform'
    );

    assert.deepEqual(paths, ['deploy/terraform/main.tf']);
  });

  it('copies remediated files from batch work dirs to checkout', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-fix-'));
    const workspaceRoot = path.join(root, 'checkout');
    const batchWorkRoot = path.join(root, 'batches');
    fs.mkdirSync(workspaceRoot, { recursive: true });

    const batchId = 'batch-0';
    const workDir = path.join(batchWorkRoot, batchId);
    fs.mkdirSync(path.dirname(path.join(workDir, 'app/main.py')), {
      recursive: true,
    });
    fs.writeFileSync(path.join(workDir, 'app/main.py'), 'fixed content\n');
    fs.mkdirSync(path.dirname(path.join(workspaceRoot, 'app/main.py')), {
      recursive: true,
    });
    fs.writeFileSync(path.join(workspaceRoot, 'app/main.py'), 'original\n');

    const result = applyOrlFixes({
      batchWorkRoot,
      workspaceRoot,
      batches: [
        {
          batchId,
          workspacePath: '.',
          orlLanguage: 'python',
          files: ['app/main.py'],
        },
      ],
      reportForBatch: () => ({
        metadata: { name: 'r' },
        spec: {
          rules_applied: 1,
          findings: 1,
          fixes: 1,
          changes: 1,
          rules: [
            {
              name: 'orl-rule:py',
              files_changed: { 'app/main.py': {} },
            },
          ],
          errors: [],
        },
      }),
      stagedFilesForBatch: () => ['app/main.py'],
    });

    assert.deepEqual(result.copiedPaths, ['app/main.py']);
    assert.equal(
      fs.readFileSync(path.join(workspaceRoot, 'app/main.py'), 'utf8'),
      'fixed content\n'
    );
  });

  it('copies via staged manifest when report only lists workspace-relative paths_with_findings', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-fix-'));
    const workspaceRoot = path.join(root, 'checkout');
    const batchWorkRoot = path.join(root, 'batches');
    fs.mkdirSync(workspaceRoot, { recursive: true });

    const batchId = 'batch-0';
    const workDir = path.join(batchWorkRoot, batchId);
    fs.mkdirSync(path.join(workDir, 'infra'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'infra/main.tf'), 'fixed tf\n');
    fs.mkdirSync(path.join(workspaceRoot, 'infra'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'infra/main.tf'), 'broken tf\n');

    const result = applyOrlFixes({
      batchWorkRoot,
      workspaceRoot,
      batches: [
        {
          batchId,
          workspacePath: 'infra',
          orlLanguage: 'terraform',
          files: ['infra/main.tf'],
        },
      ],
      reportForBatch: () => ({
        metadata: { name: 'r' },
        spec: {
          rules_applied: 1,
          findings: 5,
          fixes: 0,
          changes: 0,
          rules: [
            {
              name: 'orl-rule:tf',
              findings: 5,
              paths_with_findings: { 'main.tf': {} },
            },
          ],
          errors: [],
        },
      }),
      stagedFilesForBatch: () => ['infra/main.tf'],
    });

    assert.deepEqual(result.copiedPaths, ['infra/main.tf']);
    assert.equal(
      fs.readFileSync(path.join(workspaceRoot, 'infra/main.tf'), 'utf8'),
      'fixed tf\n'
    );
  });

  it('falls back to staged-files manifest when report has no paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-fix-'));
    const workspaceRoot = path.join(root, 'checkout');
    const batchWorkRoot = path.join(root, 'batches');
    fs.mkdirSync(workspaceRoot, { recursive: true });

    const batchId = 'batch-1';
    const workDir = path.join(batchWorkRoot, batchId);
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'template.json'), '{"fixed":true}');

    const result = applyOrlFixes({
      batchWorkRoot,
      workspaceRoot,
      batches: [
        {
          batchId,
          workspacePath: '.',
          orlLanguage: 'json',
          files: ['template.json'],
        },
      ],
      reportForBatch: () => null,
      stagedFilesForBatch: () => ['template.json'],
    });

    assert.deepEqual(result.copiedPaths, ['template.json']);
    assert.equal(
      fs.readFileSync(path.join(workspaceRoot, 'template.json'), 'utf8'),
      '{"fixed":true}'
    );
  });

  it('skips unchanged files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-fix-'));
    const workspaceRoot = path.join(root, 'checkout');
    const batchWorkRoot = path.join(root, 'batches');
    fs.mkdirSync(workspaceRoot, { recursive: true });

    const batchId = 'batch-2';
    const workDir = path.join(batchWorkRoot, batchId);
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'same.txt'), 'identical');
    fs.writeFileSync(path.join(workspaceRoot, 'same.txt'), 'identical');

    const result = applyOrlFixes({
      batchWorkRoot,
      workspaceRoot,
      batches: [
        {
          batchId,
          workspacePath: '.',
          orlLanguage: 'text',
          files: ['same.txt'],
        },
      ],
      reportForBatch: () => null,
      stagedFilesForBatch: () => ['same.txt'],
    });

    assert.deepEqual(result.copiedPaths, []);
    assert.deepEqual(result.skippedUnchanged, ['same.txt']);
  });
});
