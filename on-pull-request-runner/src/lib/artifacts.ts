/**
 * Paths under `$RUNNER_TEMP/gomboc-orl` for intermediate and uploaded action artifacts.
 */
import path from 'node:path';

/** Root directory for all action artifacts on the runner. */
export function getArtifactsRoot(): string {
  const base = process.env.RUNNER_TEMP ?? '/tmp';
  return path.join(base, 'gomboc-orl');
}

/** Absolute path for a named artifact file or subdirectory. */
export function artifactPath(name: string): string {
  return path.join(getArtifactsRoot(), name);
}
