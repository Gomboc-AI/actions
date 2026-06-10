/**
 * Minimal Gomboc Integrations Service API client.
 */
import { requireEnv } from '../env.js';
/** Non-2xx response from the Integrations API. */
export class IntegrationsApiError extends Error {
    status;
    body;
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.body = body;
        this.name = 'IntegrationsApiError';
    }
}
/** Strips a trailing slash from an Integrations base URL. */
export function normalizeIntegrationsBaseUrl(baseUrl) {
    return baseUrl.replace(/\/$/, '');
}
/** Authenticated client using `GOMBOC_ACCESS_TOKEN` and `INTEGRATIONS_SERVICE_URL`. */
export class IntegrationsClient {
    token;
    baseUrl;
    defaultTimeoutMs;
    constructor(token, baseUrl, defaultTimeoutMs = 10_000) {
        this.token = token;
        this.baseUrl = baseUrl;
        this.defaultTimeoutMs = defaultTimeoutMs;
    }
    /** Builds a client from action env vars. */
    static fromEnv() {
        return new IntegrationsClient(requireEnv('GOMBOC_ACCESS_TOKEN'), normalizeIntegrationsBaseUrl(requireEnv('INTEGRATIONS_SERVICE_URL')));
    }
    /** POSTs a normalized ORL scan payload to `/reporting/orl-external`. */
    async postOrlExternal(body, options) {
        await this.request('POST', '/reporting/orl-external', body, options?.timeoutMs);
    }
    async request(method, path, body, timeoutMs) {
        const controller = new AbortController();
        const ms = timeoutMs ?? this.defaultTimeoutMs;
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
            const res = await fetch(this.url(path), {
                method,
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new IntegrationsApiError(`Integrations API ${method} ${path} failed (${res.status})`, res.status, text);
            }
        }
        finally {
            clearTimeout(timeout);
        }
    }
    url(path) {
        const normalized = path.startsWith('/') ? path : `/${path}`;
        return `${this.baseUrl}${normalized}`;
    }
}
//# sourceMappingURL=integrations-client.js.map