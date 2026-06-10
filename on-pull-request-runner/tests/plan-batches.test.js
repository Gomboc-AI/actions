import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildEvaluationBatches,
  deepestWorkspaceForFile,
} from '../dist/lib/plan-batches.js';

describe('plan-batches', () => {
  it('deepestWorkspaceForFile prefers nested workspace', () => {
    const workspaces = [
      { workspacePath: '.', languages: [], changedFiles: [] },
      { workspacePath: 'infra/modules/vpc', languages: [], changedFiles: [] },
    ];
    assert.equal(
      deepestWorkspaceForFile('infra/modules/vpc/main.tf', workspaces),
      'infra/modules/vpc'
    );
  });

  it('buildEvaluationBatches groups by SDK language when detect-language languages are empty', () => {
    const batches = buildEvaluationBatches({
      scannableFiles: ['main.tf'],
      workspaces: [{ workspacePath: '.', languages: [], changedFiles: ['main.tf'] }],
      resolveLanguage: () => 'terraform',
    });

    assert.equal(batches.length, 1);
    assert.equal(batches[0].orlLanguage, 'terraform');
    assert.equal(batches[0].workspacePath, '.');
    assert.deepEqual(batches[0].files, ['main.tf']);
  });

  it('buildEvaluationBatches splits files by language', () => {
    const batches = buildEvaluationBatches({
      scannableFiles: ['main.tf', 'deploy.yaml'],
      workspaces: [{ workspacePath: '.', languages: [], changedFiles: [] }],
      resolveLanguage: (filePath) =>
        filePath.endsWith('.tf') ? 'terraform' : 'yaml',
    });

    assert.equal(batches.length, 2);
    assert.deepEqual(
      batches.map((b) => b.orlLanguage).sort(),
      ['terraform', 'yaml']
    );
  });
});
