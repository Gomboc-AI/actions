import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  encodedChannelPath,
  policySetNameFromChannel,
  portalChannelUrl,
  portalPolicySetUrl,
  portalRuleUrl,
  portalRunUrl,
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

  it('builds portal runs page URL from base URL', () => {
    assert.equal(portalRunUrl('https://app.gomboc.ai/'), 'https://app.gomboc.ai/runs/');
    assert.equal(portalRunUrl('https://app.gomboc.ai'), 'https://app.gomboc.ai/runs/');
  });

  it('builds portal data-library URL from rules channel name', () => {
    assert.equal(
      portalChannelUrl(
        'https://app.dev.gcp.gomboc.ai/',
        '15c221bc-69c0-4834-a0b7-89cf0c0fd857/accounts/global'
      ),
      'https://app.dev.gcp.gomboc.ai/data-library/channels/15c221bc-69c0-4834-a0b7-89cf0c0fd857/accounts/global'
    );
  });

  it('encodes spaces in rules channel URL path segments', () => {
    const channel = '15c221bc-69c0-4834-a0b7-89cf0c0fd857/set/CIS Policies';

    assert.equal(
      encodedChannelPath(channel),
      '15c221bc-69c0-4834-a0b7-89cf0c0fd857/set/CIS%20Policies'
    );
    assert.equal(
      portalChannelUrl('https://app.dev.gcp.gomboc.ai/', channel),
      'https://app.dev.gcp.gomboc.ai/data-library/channels/15c221bc-69c0-4834-a0b7-89cf0c0fd857/set/CIS%20Policies'
    );
    assert.equal(policySetNameFromChannel(channel), 'CIS Policies');
    assert.equal(
      portalPolicySetUrl('https://app.dev.gcp.gomboc.ai/', channel),
      'https://app.dev.gcp.gomboc.ai/policy-sets/CIS%20Policies'
    );
  });

  it('does not build policy set URLs for non-policy-set channels', () => {
    assert.equal(
      portalPolicySetUrl(
        'https://app.dev.gcp.gomboc.ai/',
        '15c221bc-69c0-4834-a0b7-89cf0c0fd857/accounts/global'
      ),
      undefined
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
