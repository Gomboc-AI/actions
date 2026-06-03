/**
 * Severity / risk labels from ORL rule metadata annotations and classifications.
 */
import type { OrlReportRule } from '../types.js';

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

/** Reads human-readable severity and risk from rule metadata. */
export function ruleSeverityRisk(rule: OrlReportRule): {
  severity?: string;
  risk?: string;
} {
  const ann = rule.metadata?.annotations;
  const classifications = rule.metadata?.classifications;

  const severity =
    pickAnnotation(ann, [
      'gomboc-ai/severity',
      'gomboc-ai/severity/score',
      'severity',
      'policy/severity',
      'gomboc.ai/severity',
    ]) ?? labelFromClassifications(classifications, 'severity');

  const risk =
    pickAnnotation(ann, [
      'gomboc-ai/risk/score',
      'gomboc-ai/risk/level',
      'gomboc-ai/risk',
      'risk/score',
      'risk',
      'policy/risk',
      'gomboc.ai/risk',
    ]) ?? labelFromClassifications(classifications, 'risk');

  return { severity, risk };
}

export function formatSeverityRiskCell(value: string | undefined): string {
  return value?.trim() ? value.trim() : '—';
}
