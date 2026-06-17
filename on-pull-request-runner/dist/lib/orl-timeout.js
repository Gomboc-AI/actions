const TIMEOUT_PATTERNS = [
    /context deadline exceeded/i,
    /deadline exceeded/i,
    /timed out/i,
    /timeout exceeded/i,
    /remediation timeout/i,
];
function textIndicatesTimeout(text) {
    return TIMEOUT_PATTERNS.some((pattern) => pattern.test(text));
}
/** True when ORL output or report errors indicate the global timeout was reached. */
export function isOrlTimeoutResult(args) {
    if (args.error && textIndicatesTimeout(args.error)) {
        return true;
    }
    for (const message of args.report?.spec?.errors ?? []) {
        if (textIndicatesTimeout(message)) {
            return true;
        }
    }
    return false;
}
/** Warning line when a batch stopped because ORL hit `--timeout`. */
export function formatBatchTimeoutWarning(args) {
    const scope = `${args.workspacePath}/${args.orlLanguage}`;
    return `Batch ${args.batchId} (${scope}): ORL remediate stopped because the configured timeout was reached; partial results were kept.`;
}
//# sourceMappingURL=orl-timeout.js.map