/**
 * Docker CLI helpers for ORL image invocations.
 */
import { execFileSync, spawn } from 'node:child_process';

export type DockerRunArgs = {
  argv: string[];
  timeoutMs?: number;
  /** Container name passed via --name; used to docker-kill the container on timeout. */
  containerName?: string;
};

/**
 * Runs `docker` with the given args; does not throw on non-zero exit.
 *
 * Uses async `spawn` (not `spawnSync`) so callers in a `mapPool` can run
 * concurrently without blocking the Node.js event loop.
 *
 * On timeout, kills the named Docker container via `docker kill` before
 * sending SIGKILL to the CLI process — necessary because killing the CLI
 * client does not stop the container managed by the Docker daemon.
 */
export async function dockerRun(args: DockerRunArgs): Promise<{
  status: number;
  stdout: string;
  stderr: string;
}> {
  const { argv, timeoutMs, containerName } = args;

  return new Promise((resolve) => {
    const proc = spawn('docker', argv, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        if (containerName) {
          try {
            execFileSync('docker', ['kill', containerName], { stdio: 'ignore' });
          } catch {
            // container already exited — ignore
          }
        }
        proc.kill('SIGKILL');
      }, timeoutMs);
    }

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        status: timedOut ? 1 : (code ?? 1),
        stdout,
        stderr,
      });
    });
  });
}

/** Like {@link dockerRun} but throws when exit status is non-zero. */
export async function dockerRunOrThrow(args: DockerRunArgs): Promise<void> {
  const { status, stderr, stdout } = await dockerRun(args);
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
