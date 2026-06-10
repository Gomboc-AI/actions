/**
 * Helpers for reading GitHub Action inputs and required environment variables.
 */

/** Returns `process.env[name]` or throws if unset or empty. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/** Parses an integer env var, or returns `defaultValue` when missing or invalid. */
export function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

/** True when env is `true` or `1`; otherwise uses `defaultValue` if unset. */
export function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return raw === 'true' || raw === '1';
}
