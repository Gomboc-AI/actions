/**
 * Docker CLI helpers for ORL image invocations.
 */
import { execFileSync, spawnSync } from 'node:child_process';

export type DockerRunArgs = {
  argv: string[];
  timeoutMs?: number;
};

/**
 * Runs `docker` with the given args; does not throw on non-zero exit.
 */
export function dockerRun(args: DockerRunArgs): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const { argv, timeoutMs } = args;
  const result = spawnSync('docker', argv, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: timeoutMs,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Like {@link dockerRun} but throws when exit status is non-zero. */
export function dockerRunOrThrow(args: DockerRunArgs): void {
  const { status, stderr, stdout } = dockerRun(args);
  if (status !== 0) {
    throw new Error(`docker ${args.argv.join(' ')} failed (${status}): ${stderr || stdout}`);
  }
}

/** UID/GID for `docker run --user` so container files match the runner user. */
export function currentUidGid(): { uid: string; gid: string } {
  if (process.platform === 'win32') {
    return { uid: '0', gid: '0' };
  }
  const uid = execFileSync('id', ['-u'], { encoding: 'utf8' }).trim();
  const gid = execFileSync('id', ['-g'], { encoding: 'utf8' }).trim();
  return { uid, gid };
}
