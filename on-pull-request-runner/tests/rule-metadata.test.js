import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatScoreMarkdown,
  ruleImpactRisk,
} from '../dist/lib/rule-metadata.js';
import { formatRuleDisplayLink } from '../dist/lib/portal-url.js';

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

  it('formats scores as uppercase markdown code spans', () => {
    assert.equal(formatScoreMarkdown('high'), '`HIGH`');
    assert.equal(formatScoreMarkdown('medium'), '`MEDIUM`');
    assert.equal(formatScoreMarkdown(undefined), '—');
  });
});

describe('formatRuleDisplayLink', () => {
  it('links rule display name to portal data library', () => {
    const link = formatRuleDisplayLink({
      displayName: 'Ensure Storage Bucket uniform bucket-level access is enabled',
      ruleName:
        'gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled001',
      portalBaseUrl: 'https://app.gomboc.ai',
    });
    assert.match(
      link,
      /^\[Ensure Storage Bucket uniform bucket-level access is enabled\]\(https:\/\/app\.gomboc\.ai\/data-library\/rules\/gomboc-ai\/ensure-storage-bucket-uniform-bucket-level-access-is-enabled\)$/
    );
  });
});
