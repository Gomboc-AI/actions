/**
 * Minimal Gomboc Integrations Service API client.
 */
import { requireEnv } from '../env.js';

export type OrlExternalReport = {
  path: string;
  branch: string;
  orlReport: Record<string, unknown>;
  github: {
    repository: string;
    prNumber: number;
    headSha: string;
  };
};

export type OrlExternalRequest = {
  version: number;
  requestOrigin: string;
  effect: string;
  reports: OrlExternalReport[];
  errors: Array<{ status: number; message: string }>;
};

/** Non-2xx response from the Integrations API. */
export class IntegrationsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
    this.name = 'IntegrationsApiError';
  }
}

/** Strips a trailing slash from an Integrations base URL. */
export function normalizeIntegrationsBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

/** Authenticated client using `GOMBOC_ACCESS_TOKEN` and `INTEGRATIONS_SERVICE_URL`. */
export class IntegrationsClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
    private readonly defaultTimeoutMs = 10_000
  ) {}

  /** Builds a client from action env vars. */
  static fromEnv(): IntegrationsClient {
    return new IntegrationsClient(
      requireEnv('GOMBOC_ACCESS_TOKEN'),
      normalizeIntegrationsBaseUrl(requireEnv('INTEGRATIONS_SERVICE_URL'))
    );
  }

  /** POSTs a normalized ORL scan payload to `/reporting/orl-external`. */
  async postOrlExternal(
    body: OrlExternalRequest,
    options?: { timeoutMs?: number }
  ): Promise<void> {
    await this.request('POST', '/reporting/orl-external', body, options?.timeoutMs);
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs?: number
  ): Promise<void> {
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
        throw new IntegrationsApiError(
          `Integrations API ${method} ${path} failed (${res.status})`,
          res.status,
          text
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private url(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalized}`;
  }
}
