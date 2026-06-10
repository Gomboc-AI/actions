import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  auditCommentMarker,
  parseAuditCommentDedupeKey,
} from '../dist/lib/extract-audit-comments.js';

describe('audit-comment-marker', () => {
  it('embeds dedupe key in inline comment marker', () => {
    assert.equal(
      auditCommentMarker('rule:main.tf:12'),
      '<!-- gomboc-orl-audit key=rule:main.tf:12 -->'
    );
  });

  it('parses dedupe key from inline comment marker', () => {
    assert.equal(
      parseAuditCommentDedupeKey(
        '<!-- gomboc-orl-audit key=rule:main.tf:12 -->\n### Title'
      ),
      'rule:main.tf:12'
    );
    assert.equal(
      parseAuditCommentDedupeKey('<!-- gomboc-orl-audit -->\n## Summary'),
      null
    );
  });
});
