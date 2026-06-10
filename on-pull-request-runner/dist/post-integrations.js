/**
 * Composite step: POST normalized scan payload to Gomboc Integrations (non-blocking on failure).
 */
import fs from 'node:fs';
import { initIntegrationsServiceSdk } from '@gomboc-ai/gomboc-node-sdk';
import { artifactPath } from './lib/artifacts.js';
import { appendActionNotice, integrationsErrorMessage, } from './lib/action-notices.js';
import { buildCreateOrlReportEventBody } from './lib/build-orl-report-event.js';
import { envBool, requireEnv } from './lib/env.js';
import { appendStepSummary } from './lib/github-output.js';
import { loadPullRequestContext } from './lib/github-context.js';
import { tenantIdFromToken } from './lib/jwt.js';
import { runMain } from './lib/runner.js';
async function main() {
    if (!envBool('INPUT_INTEGRATIONS_ENABLED', true)) {
        console.log('Integrations disabled; skipping POST');
        return;
    }
    const token = requireEnv('GOMBOC_ACCESS_TOKEN');
    const accountId = tenantIdFromToken(token);
    if (!accountId) {
        const message = 'GOMBOC_ACCESS_TOKEN is missing tenantId; cannot initialize Integrations SDK';
        appendActionNotice({ level: 'error', source: 'integrations', message });
        appendStepSummary(`### Integrations warning\n\n${message}\n`);
        console.warn(message);
        return;
    }
    const pr = loadPullRequestContext();
    const orlReport = JSON.parse(fs.readFileSync(artifactPath('normalized-report.json'), 'utf8'));
    const batches = JSON.parse(fs.readFileSync(artifactPath('evaluation-batches.json'), 'utf8'));
    const paths = [...new Set(batches.batches.map((b) => b.workspacePath))];
    const reportPath = paths.length === 1 ? paths[0] : '.';
    const body = buildCreateOrlReportEventBody({
        orlReport,
        path: reportPath,
        branch: pr.headRef || process.env.GITHUB_REF_NAME || '',
        github: pr,
    });
    const sdk = await initIntegrationsServiceSdk({
        accessToken: token,
        accountId,
        baseUrl: requireEnv('INTEGRATIONS_SERVICE_URL').replace(/\/$/, ''),
        logger: console,
    });
    const result = await sdk.createOrlReportEvent(body);
    if (result.isOk()) {
        console.log('Integrations POST succeeded');
        return;
    }
    const error = result.error;
    const status = error.statusCode ?? 400;
    const responseBody = JSON.stringify({ error });
    const message = integrationsErrorMessage(status, responseBody);
    appendActionNotice({
        level: status === 401 || status === 403 ? 'error' : 'warning',
        source: 'integrations',
        status,
        message,
    });
    appendStepSummary(`### Integrations warning\n\nPOST failed (${status}): ${responseBody.slice(0, 500)}\n`);
    console.warn(`Integrations POST failed: ${status} ${responseBody}`);
}
runMain(main);
//# sourceMappingURL=post-integrations.js.map