import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ruleImpactRisk } from '../dist/lib/rule-metadata.js';

describe('rule-metadata', () => {
  it('reads gomboc-ai impact/risk scores and statement-plain annotations', () => {
    const { impact, impactStatement, risk, riskStatement } = ruleImpactRisk({
      name: 'orl-rule:test',
      metadata: {
        annotations: {
          'gomboc-ai/impact/score': 'high',
          'gomboc-ai/impact/statement-plain':
            'Simplifies access control by enforcing IAM-based permissions.',
          'gomboc-ai/risk/score': 'medium',
          'gomboc-ai/risk/statement-plain':
            'Applications relying on ACLs will immediately lose access.',
        },
      },
    });
    assert.equal(impact, 'high');
    assert.equal(risk, 'medium');
    assert.match(impactStatement ?? '', /IAM-based permissions/);
    assert.match(riskStatement ?? '', /lose access/);
  });
});
