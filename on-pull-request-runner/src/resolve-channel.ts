/**
 * Composite step: resolve ORL rules channel from `orl-channel` input or Gomboc PAT JWT.
 */
import { setOutput } from './lib/github-output.js';
import { tenantIdFromToken } from './lib/jwt.js';
import { requireEnv } from './lib/env.js';
import { runMain } from './lib/runner.js';

async function main(): Promise<void> {
  const inputChannel = (process.env.INPUT_ORL_CHANNEL ?? '').trim();
  if (inputChannel) {
    setOutput('channel', inputChannel);
    console.log(`Using orl-channel input: ${inputChannel}`);
    return;
  }

  const token = requireEnv('GOMBOC_ACCESS_TOKEN');
  const tenantId = tenantIdFromToken(token);
  const channel = tenantId ? `${tenantId}/accounts/default` : 'default';
  setOutput('channel', channel);
  console.log(`Resolved rules channel: ${channel}`);
}

runMain(main);
