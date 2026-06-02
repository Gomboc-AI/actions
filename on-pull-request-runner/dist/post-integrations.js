/**
 * Composite step: POST normalized scan payload to Gomboc Integrations (non-blocking on failure).
 */
import fs from 'node:fs';
import { artifactPath } from './lib/artifacts.js';
import { envBool } from './lib/env.js';
import { appendStepSummary } from './lib/github-output.js';
import { loadPullRequestContext } from './lib/github-context.js';
import { runMain } from './lib/runner.js';
import { requireEnv } from './lib/env.js';
async function main() {
    if (!envBool('INPUT_INTEGRATIONS_ENABLED', true)) {
        console.log('Integrations disabled; skipping POST');
        return;
    }
    const token = requireEnv('GOMBOC_ACCESS_TOKEN');
    const baseUrl = requireEnv('INTEGRATIONS_SERVICE_URL').replace(/\/$/, '');
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        const res = await fetch(`${baseUrl}/reporting/orl-external`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text();
            appendStepSummary(`### Integrations warning\n\nPOST failed (${res.status}): ${text.slice(0, 500)}\n`);
            console.warn(`Integrations POST failed: ${res.status} ${text}`);
            return;
        }
        console.log('Integrations POST succeeded');
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendStepSummary(`### Integrations warning\n\n${message}\n`);
        console.warn(`Integrations POST error: ${message}`);
    }
    finally {
        clearTimeout(timeout);
    }
}
runMain(main);
//# sourceMappingURL=post-integrations.js.map