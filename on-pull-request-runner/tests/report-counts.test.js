import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  countRuleFindings,
  countRuleRemediationSlots,
  totalsFromReport,
} from '../dist/lib/report-counts.js';

describe('report-counts', () => {
  it('uses finding_locations when findings count is 0', () => {
    assert.equal(
      countRuleFindings({
        name: 'rule',
        findings: 0,
        finding_locations: [{ id: 'a' }, { id: 'b' }],
      }),
      2
    );
  });

  it('prefers rule-level totals when spec findings is 0', () => {
    const totals = totalsFromReport({
      metadata: { name: 'r' },
      spec: {
        findings: 0,
        fixes: 0,
        changes: 0,
        rules: [{ name: 'rule-a', findings: 1, fixes: 1, changes: 1 }],
      },
    });
    assert.equal(totals.findings, 1);
    assert.equal(totals.fixes, 1);
    assert.equal(totals.changes, 1);
  });

  it('countRuleRemediationSlots falls back to fixes when findings are cleared', () => {
    assert.equal(
      countRuleRemediationSlots({
        name: 'rule',
        findings: 0,
        fixes: 3,
        changes: 1,
      }),
      3
    );
    assert.equal(
      countRuleRemediationSlots({
        name: 'rule',
        findings: 2,
        fixes: 5,
      }),
      2
    );
  });
});
