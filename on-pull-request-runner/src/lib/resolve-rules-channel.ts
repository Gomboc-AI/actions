/**
 * Resolves an ORL rules channel via Rules Service GET /api/v1/channels/get.
 * Candidate order matches gbw-typescript (minus workspace-specific channel).
 */
const CHANNELS_GET_ENDPOINT = '/api/v1/channels/get';
export const DEFAULT_CHANNEL_NAME = 'default';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Channel names to try, in priority order. */
export function buildChannelCandidates(accountId: string): string[] {
  return [
    `${accountId}/accounts/global`,
    `${accountId}/set/default`,
    `${accountId}/accounts/default`,
    DEFAULT_CHANNEL_NAME,
  ];
}

type ChannelsGetResponse = {
  data?: { name?: string };
};

async function channelExists(args: {
  rulesServiceUrl: string;
  token: string;
  accountId: string;
  channelName: string;
}): Promise<string | null> {
  const base = args.rulesServiceUrl.replace(/\/+$/, '');
  const url = new URL(`${base}${CHANNELS_GET_ENDPOINT}`);
  url.searchParams.set('name', args.channelName);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${args.token}`,
          'x-account-id': args.accountId,
          'x-organization-id': args.accountId,
        },
      });

      if (res.status === 404) return null;

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const body = (await res.json()) as ChannelsGetResponse;
      const name = body.data?.name?.trim();
      return name || null;
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(
          `Failed to check channel "${args.channelName}" after ${MAX_RETRIES} attempts: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  return null;
}

/** Returns the first existing channel name, or `default` if none match. */
export async function resolveRulesChannel(args: {
  token: string;
  accountId: string;
  rulesServiceUrl: string;
}): Promise<string> {
  const candidates = buildChannelCandidates(args.accountId);

  for (const channelName of candidates) {
    const resolved = await channelExists({
      rulesServiceUrl: args.rulesServiceUrl,
      token: args.token,
      accountId: args.accountId,
      channelName,
    });
    if (resolved) return resolved;
  }

  return DEFAULT_CHANNEL_NAME;
}
