/**
 * Composite step: POST normalized scan payload to Gomboc Integrations (non-blocking on failure).
 */
import fs from 'node:fs';
import { artifactPath } from './lib/artifacts.js';
import { appendActionNotice, integrationsErrorMessage, } from './lib/action-notices.js';
import { envBool } from './lib/env.js';
import { appendStepSummary } from './lib/github-output.js';
import { loadPullRequestContext } from './lib/github-context.js';
import { IntegrationsApiError, IntegrationsClient, } from './lib/clients/integrations-client.js';
import { runMain } from './lib/runner.js';
async function main() {
    if (!envBool('INPUT_INTEGRATIONS_ENABLED', true)) {
        console.log('Integrations disabled; skipping POST');
        return;
    }
    const pr = loadPullRequestContext();
    const normalized = JSON.parse(fs.readFileSync(artifactPath('normalized-report.json'), 'utf8'));
    const batches = JSON.parse(fs.readFileSync(artifactPath('evaluation-batches.json'), 'utf8'));
    const paths = [...new Set(batches.batches.map((b) => b.workspacePath))];
    const reportPath = paths.length === 1 ? paths[0] : '.';
    const body = {
        version: 1.0,
        requestOrigin: 'GITHUB_ACTION',
        effect: 'SubmitForReview',
        reports: [
            {
                path: reportPath,
                branch: pr.headRef || process.env.GITHUB_REF_NAME || '',
                orlReport: normalized,
                github: {
                    repository: pr.repository,
                    prNumber: pr.number,
                    headSha: pr.headSha,
                },
            },
        ],
        errors: [],
    };
    const client = IntegrationsClient.fromEnv();
    try {
        await client.postOrlExternal(body);
        console.log('Integrations POST succeeded');
    }
    catch (err) {
        if (err instanceof IntegrationsApiError) {
            const message = integrationsErrorMessage(err.status, err.body);
            appendActionNotice({
                level: err.status === 401 || err.status === 403 ? 'error' : 'warning',
                source: 'integrations',
                status: err.status,
                message,
            });
            appendStepSummary(`### Integrations warning\n\nPOST failed (${err.status}): ${err.body.slice(0, 500)}\n`);
            console.warn(`Integrations POST failed: ${err.status} ${err.body}`);
            return;
        }
        const message = err instanceof Error ? err.message : String(err);
        appendActionNotice({
            level: 'warning',
            source: 'integrations',
            message,
        });
        appendStepSummary(`### Integrations warning\n\n${message}\n`);
        console.warn(`Integrations POST error: ${message}`);
    }
}
runMain(main);
//# sourceMappingURL=post-integrations.js.map