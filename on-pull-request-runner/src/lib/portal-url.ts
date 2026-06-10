/**
 * Builds Gomboc portal URLs for ORL rules (data library).
 */

/** Strips trailing instance digits from a rule name to get the ruleset path. */
export function rulesetPathFromRuleName(ruleName: string): string {
  return ruleName.replace(/\d+$/, '');
}

export type PortalRuleUrlArgs = {
  portalBaseUrl: string;
  ruleName: string;
};

/**
 * Portal rule page URL for a triggered rule instance.
 *
 * Example:
 * `gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled001`
 * → `https://app.gomboc.ai/data-library/rules/gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled`
 */
export function portalRuleUrl(args: PortalRuleUrlArgs): string {
  const base = args.portalBaseUrl.trim().replace(/\/+$/, '');
  const rulesetPath = rulesetPathFromRuleName(args.ruleName.trim());
  const segments = rulesetPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  return `${base}/data-library/rules/${segments.join('/')}`;
}

export function formatRuleDisplayLink(args: {
  displayName: string;
  ruleName: string;
  portalBaseUrl?: string;
}): string {
  const base = args.portalBaseUrl?.trim();
  if (!base) return args.displayName;
  const href = portalRuleUrl({ portalBaseUrl: base, ruleName: args.ruleName });
  return `[${args.displayName}](${href})`;
}
