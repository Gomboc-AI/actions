/**
 * Builds Gomboc portal URLs for ORL rules (data library).
 */
/** Strips trailing instance digits from a rule name to get the ruleset path. */
export function rulesetPathFromRuleName(ruleName) {
    return ruleName.replace(/\d+$/, '');
}
/**
 * Portal rule page URL for a triggered rule instance.
 *
 * Example:
 * `gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled001`
 * → `https://app.gomboc.ai/data-library/rules/gomboc-ai/ensure-storage-bucket-uniform-bucket-level-access-is-enabled`
 */
export function portalRuleUrl(args) {
    const base = args.portalBaseUrl.trim().replace(/\/+$/, '');
    const rulesetPath = rulesetPathFromRuleName(args.ruleName.trim());
    const segments = rulesetPath
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment));
    return `${base}/data-library/rules/${segments.join('/')}`;
}
/** Portal runs page URL for the current assessment. */
export function portalRunUrl(portalBaseUrl) {
    const base = portalBaseUrl.trim().replace(/\/+$/, '');
    return `${base}/runs/`;
}
/** Portal channel page URL for a resolved rules channel. */
export function portalChannelUrl(portalBaseUrl, channelName) {
    const base = portalBaseUrl.trim().replace(/\/+$/, '');
    const segments = channelName
        .trim()
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment));
    return `${base}/data-library/channels/${segments.join('/')}`;
}
export function formatRuleDisplayLink(args) {
    const base = args.portalBaseUrl?.trim();
    if (!base)
        return args.displayName;
    const href = portalRuleUrl({ portalBaseUrl: base, ruleName: args.ruleName });
    return `[${args.displayName}](${href})`;
}
//# sourceMappingURL=portal-url.js.map