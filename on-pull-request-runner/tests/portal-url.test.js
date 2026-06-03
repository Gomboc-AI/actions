import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  portalRuleUrl,
  rulesetPathFromRuleName,
} from '../dist/lib/portal-url.js';

describe('portal-url', () => {
  it('strips trailing instance digits from rule name', () => {
    assert.equal(
      rulesetPathFromRuleName(
        'gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled001'
      ),
      'gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled'
    );
  });

  it('builds portal data-library URL from rule instance name', () => {
    assert.equal(
      portalRuleUrl({
        portalBaseUrl: 'https://app.gomboc.ai/',
        ruleName:
          'gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled001',
      }),
      'https://app.gomboc.ai/data-library/rules/gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled'
    );
  });

  it('leaves rule names without trailing digits unchanged', () => {
    assert.equal(
      portalRuleUrl({
        portalBaseUrl: 'https://app.gomboc.ai',
        ruleName: 'gomboc-ai/my-rule',
      }),
      'https://app.gomboc.ai/data-library/rules/gomboc-ai/my-rule'
    );
  });
});
