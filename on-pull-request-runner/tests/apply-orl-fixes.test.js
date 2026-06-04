import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyOrlFixes,
  pathsFromReport,
} from '../dist/lib/apply-orl-fixes.js';

describe('apply-orl-fixes', () => {
  it('collects paths from report files_changed and paths_with_findings', () => {
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
});
