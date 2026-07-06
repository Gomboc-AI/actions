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

/** Portal runs page URL for the current assessment. */
export function portalRunUrl(portalBaseUrl: string): string {
  const base = portalBaseUrl.trim().replace(/\/+$/, '');
  return `${base}/runs/`;
}

/** URL-encodes a rules channel while preserving slash-delimited path segments. */
export function encodedChannelPath(channelName: string): string {
  return channelName
    .trim()
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function policySetNameFromChannel(channelName: string): string | undefined {
  const segments = channelName.trim().split('/').filter(Boolean);
  const setIndex = segments.indexOf('set');
  if (setIndex === -1) return undefined;
  return segments.slice(setIndex + 1).join('/') || undefined;
}

export function portalPolicySetUrl(
  portalBaseUrl: string,
  channelName: string
): string | undefined {
  const policySetName = policySetNameFromChannel(channelName);
  if (!policySetName) return undefined;

  const base = portalBaseUrl.trim().replace(/\/+$/, '');
  const encodedPolicySetName = policySetName
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base}/policy-sets/${encodedPolicySetName}`;
}

/** Portal channel page URL for a resolved rules channel. */
export function portalChannelUrl(portalBaseUrl: string, channelName: string): string {
  const base = portalBaseUrl.trim().replace(/\/+$/, '');
  return `${base}/data-library/channels/${encodedChannelPath(channelName)}`;
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
