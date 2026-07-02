/**
 * Composite step: resolve ORL rules channel from `orl-channel` input or Gomboc PAT JWT.
 */
import { setOutput } from './lib/github-output.js';
import { tenantIdFromToken } from './lib/jwt.js';
import { DEFAULT_CHANNEL_NAME, resolveRulesChannel, } from './lib/resolve-rules-channel.js';
import { requireEnv } from './lib/env.js';
import { portalChannelUrl } from './lib/portal-url.js';
import { runMain } from './lib/runner.js';
async function main() {
    const inputChannel = (process.env.INPUT_ORL_CHANNEL ?? '').trim();
    const portalServiceUrl = (process.env.INPUT_PORTAL_SERVICE_URL?.trim() || 'https://app.gomboc.ai').replace(/\/+$/, '');
    if (inputChannel) {
        setOutput('channel', inputChannel);
        console.log(`Using orl-channel input: ${inputChannel}`);
        return;
    }
    const token = requireEnv('GOMBOC_ACCESS_TOKEN');
    const rulesServiceUrl = (process.env.RULES_SERVICE_URL ?? 'https://rules.app.gomboc.ai').trim();
    const tenantId = tenantIdFromToken(token);
    if (!tenantId) {
        setOutput('channel', DEFAULT_CHANNEL_NAME);
        console.log(`Resolved rules channel: ${DEFAULT_CHANNEL_NAME} (Portal: ${portalChannelUrl(portalServiceUrl, DEFAULT_CHANNEL_NAME)})`);
        return;
    }
    const channel = await resolveRulesChannel({
        token,
        accountId: tenantId,
        rulesServiceUrl,
    });
    setOutput('channel', channel);
    console.log(`Resolved rules channel: ${channel} (Portal: ${portalChannelUrl(portalServiceUrl, channel)})`);
}
runMain(main);
//# sourceMappingURL=resolve-channel.js.map