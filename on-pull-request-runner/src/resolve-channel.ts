/**
 * Composite step: resolve ORL rules channel from `orl-channel` input or Gomboc PAT JWT.
 */
import { setOutput } from './lib/github-output.js';
import { tenantIdFromToken } from './lib/jwt.js';
import {
  DEFAULT_CHANNEL_NAME,
  resolveRulesChannel,
} from './lib/resolve-rules-channel.js';
import { requireEnv } from './lib/env.js';
import {
  encodedChannelPath,
  portalChannelUrl,
  portalPolicySetUrl,
} from './lib/portal-url.js';
import { runMain } from './lib/runner.js';

function setChannelOutputs(channel: string): void {
  setOutput('channel', channel);
  setOutput('encoded-channel', encodedChannelPath(channel));
}

function formatChannelLogLine(
  label: string,
  channel: string,
  portalServiceUrl: string
): string {
  const policySetUrl = portalPolicySetUrl(portalServiceUrl, channel);
  const lines = [`${label}: ${channel}`];
  if (policySetUrl) {
    lines.push(`Policy set: ${policySetUrl}`);
  }
  lines.push(`Channel: ${portalChannelUrl(portalServiceUrl, channel)}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const inputChannel = (process.env.INPUT_ORL_CHANNEL ?? '').trim();
  const portalServiceUrl = (
    process.env.INPUT_PORTAL_SERVICE_URL?.trim() || 'https://app.gomboc.ai'
  ).replace(/\/+$/, '');

  if (inputChannel) {
    setChannelOutputs(inputChannel);
    console.log(
      formatChannelLogLine('Using orl-channel input', inputChannel, portalServiceUrl)
    );
    return;
  }

  const token = requireEnv('GOMBOC_ACCESS_TOKEN');
  const rulesServiceUrl = (
    process.env.RULES_SERVICE_URL ?? 'https://rules.app.gomboc.ai'
  ).trim();
  const tenantId = tenantIdFromToken(token);

  if (!tenantId) {
    setChannelOutputs(DEFAULT_CHANNEL_NAME);
    console.log(
      formatChannelLogLine('Resolved rules channel', DEFAULT_CHANNEL_NAME, portalServiceUrl)
    );
    return;
  }

  const channel = await resolveRulesChannel({
    token,
    accountId: tenantId,
    rulesServiceUrl,
  });

  setChannelOutputs(channel);
  console.log(
    formatChannelLogLine('Resolved rules channel', channel, portalServiceUrl)
  );
}

runMain(main);
