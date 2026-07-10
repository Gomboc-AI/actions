/**
 * Resolves an ORL rules channel via Rules Service GET /api/v1/channels/get.
 * Candidate order matches gbw-typescript (minus workspace-specific channel).
 */
const CHANNELS_GET_ENDPOINT = '/api/v1/channels/get';
export const DEFAULT_CHANNEL_NAME = 'default';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class TransientChannelLookupError extends Error {
    channelName;
    constructor(channelName, message) {
        super(message);
        this.channelName = channelName;
        this.name = 'TransientChannelLookupError';
    }
}
/** Channel names to try, in priority order. */
export function buildChannelCandidates(accountId) {
    return [
        `${accountId}/accounts/global`,
        `${accountId}/set/default`,
        `${accountId}/accounts/default`,
        DEFAULT_CHANNEL_NAME,
    ];
}
function isTransientLookupError(error) {
    if (!(error instanceof Error))
        return true;
    const match = /^HTTP (\d{3})/.exec(error.message);
    if (!match)
        return true;
    const status = Number(match[1]);
    return status >= 500 && status < 600;
}
async function channelExists(args) {
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
            if (res.status === 404)
                return null;
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }
            const body = (await res.json());
            const name = body.data?.name?.trim();
            return name || null;
        }
        catch (error) {
            if (attempt === MAX_RETRIES - 1) {
                const message = `Failed to check channel "${args.channelName}" after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : String(error)}`;
                if (isTransientLookupError(error)) {
                    throw new TransientChannelLookupError(args.channelName, message);
                }
                throw new Error(message);
            }
            await sleep(RETRY_DELAY_MS);
        }
    }
    return null;
}
/** Returns the first existing channel name, or `default` if none match. */
export async function resolveRulesChannel(args) {
    const candidates = buildChannelCandidates(args.accountId);
    for (const channelName of candidates) {
        try {
            const resolved = await channelExists({
                rulesServiceUrl: args.rulesServiceUrl,
                token: args.token,
                accountId: args.accountId,
                channelName,
            });
            if (resolved)
                return resolved;
        }
        catch (error) {
            if (error instanceof TransientChannelLookupError) {
                console.warn(`${error.message}. Using "${error.channelName}" and deferring validation to orl rules pull.`);
                return error.channelName;
            }
            throw error;
        }
    }
    return DEFAULT_CHANNEL_NAME;
}
//# sourceMappingURL=resolve-rules-channel.js.map