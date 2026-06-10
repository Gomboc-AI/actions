import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeTouchSeeds,
  isUnderPath,
  joinRepoPath,
  normalizeRepoPath,
} from '../dist/lib/paths.js';

describe('paths', () => {
  it('normalizeRepoPath strips ./ prefix', () => {
    assert.equal(normalizeRepoPath('./infra'), 'infra');
    assert.equal(normalizeRepoPath('.'), '.');
  });

  it('computeTouchSeeds keeps deepest seed only', () => {
    const seeds = computeTouchSeeds([
      'infra/modules/vpc/main.tf',
      'infra/modules/vpc/vars.tf',
    ]);
    assert.deepEqual(seeds, ['infra/modules/vpc']);
  });

  it('isUnderPath matches descendants', () => {
    assert.equal(isUnderPath({ filePath: 'infra/a.tf', dirPath: 'infra' }), true);
    assert.equal(isUnderPath({ filePath: 'apps/a.tf', dirPath: 'infra' }), false);
  });

  it('joinRepoPath combines seed and detect key', () => {
    assert.equal(
      joinRepoPath({ base: 'infra', rel: './modules/vpc' }),
      'infra/modules/vpc'
    );
  });
});
