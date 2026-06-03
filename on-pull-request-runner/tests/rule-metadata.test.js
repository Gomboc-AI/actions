import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ruleSeverityRisk } from '../dist/lib/rule-metadata.js';

describe('rule-metadata', () => {
  it('reads gomboc-ai annotation keys', () => {
    const { severity, risk } = ruleSeverityRisk({
      name: 'orl-rule:test',
      metadata: {
        annotations: {
          'gomboc-ai/severity/score': 'Critical',
          'gomboc-ai/risk/score': 'High',
        },
      },
    });
    assert.equal(severity, 'Critical');
    assert.equal(risk, 'High');
  });
});
