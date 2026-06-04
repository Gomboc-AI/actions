/**
 * Human-readable `orl remediate` exit codes (from `orl remediate --help`).
 */
export function orlRemediateExitExplanation(exitCode) {
    switch (exitCode) {
        case 1:
            return 'An unrecoverable error prevented remediation from running';
        case 2:
            return 'ORL could not remediate all findings; remaining issues are listed in the report';
        case 3:
            return 'Errors occurred during remediation; see the batch report for details';
        default:
            return `ORL exited with unexpected code ${exitCode}`;
    }
}
/** Warning line for a batch that finished with a non-success remediate exit code. */
export function formatBatchExitWarning(args) {
    const scope = `${args.workspacePath}/${args.orlLanguage}`;
    return `Batch ${args.batchId} (${scope}): ${orlRemediateExitExplanation(args.exitCode)}.`;
}
//# sourceMappingURL=orl-exit-codes.js.map