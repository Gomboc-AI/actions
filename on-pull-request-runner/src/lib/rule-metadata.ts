/**
 * Impact / risk labels and statements from ORL rule metadata annotations.
 */
import type { OrlReportRule } from '../types.js';

export type RuleImpactRisk = {
  impact?: string;
  impactStatement?: string;
  risk?: string;
  riskStatement?: string;
};

function pickAnnotation(
  annotations: Record<string, string> | undefined,
  keys: string[]
): string | undefined {
  if (!annotations) return undefined;
  const lower = new Map(
    Object.entries(annotations).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const key of keys) {
    const hit = lower.get(key.toLowerCase());
    if (hit) return hit;
  }
  for (const [k, v] of Object.entries(annotations)) {
    const lk = k.toLowerCase();
    for (const key of keys) {
      const needle = key.toLowerCase();
      if (lk === needle || lk.endsWith(`/${needle}`)) return v;
    }
  }
  return undefined;
}

function labelFromClassifications(
  classifications: string[] | undefined,
  segment: string
): string | undefined {
  if (!classifications?.length) return undefined;
  const needle = segment.toLowerCase();
  for (const c of classifications) {
    const parts = c.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p.toLowerCase() === needle);
    if (idx >= 0 && idx + 1 < parts.length) {
      return parts[idx + 1];
    }
  }
  return undefined;
}

/** Reads impact/risk scores and plain-text statements from rule metadata. */
export function ruleImpactRisk(rule: OrlReportRule): RuleImpactRisk {
  const ann = rule.metadata?.annotations;
  const classifications = rule.metadata?.classifications;

  return {
    impact:
      pickAnnotation(ann, [
        'gomboc-ai/impact/score',
        'gomboc-ai/impact',
        'impact/score',
        'impact',
      ]) ?? labelFromClassifications(classifications, 'impact'),
    impactStatement: pickAnnotation(ann, [
      'gomboc-ai/impact/statement-plain',
      'gomboc-ai/impact/statement',
    ]),
    risk:
      pickAnnotation(ann, [
        'gomboc-ai/risk/score',
        'gomboc-ai/risk/level',
        'gomboc-ai/risk',
        'risk/score',
        'risk',
        'policy/risk',
      ]) ?? labelFromClassifications(classifications, 'risk'),
    riskStatement: pickAnnotation(ann, [
      'gomboc-ai/risk/statement-plain',
      'gomboc-ai/risk/statement',
    ]),
  };
}

/** Rule description from metadata or `gomboc-ai/description-plain`. */
export function ruleDescription(rule: OrlReportRule): string | undefined {
  const meta = rule.metadata;
  return (
    meta?.description?.trim() ||
    pickAnnotation(meta?.annotations, [
      'gomboc-ai/description-plain',
      'gomboc-ai/description',
    ])
  );
}

export function formatScoreCell(value: string | undefined): string {
  return value?.trim() ? value.trim() : '—';
}

export function formatScoreLabel(value: string | undefined): string {
  const cell = formatScoreCell(value);
  return cell === '—' ? cell : cell.toUpperCase();
}

/** Uppercase score wrapped in backticks for markdown tables and headings. */
export function formatScoreMarkdown(value: string | undefined): string {
  const label = formatScoreLabel(value);
  return label === '—' ? label : `\`${label}\``;
}
