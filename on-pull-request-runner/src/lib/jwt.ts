/**
 * Minimal JWT payload decoding for Gomboc PAT channel resolution (no signature verify).
 */

/** Decodes the middle segment of a JWT; returns null if malformed. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Extracts `tenantId` from a Gomboc access token payload. */
export function tenantIdFromToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const tenantId = payload?.tenantId;
  return typeof tenantId === 'string' && tenantId.length > 0 ? tenantId : null;
}
