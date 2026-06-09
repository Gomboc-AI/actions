/**
 * Docker CLI helpers for ORL image invocations.
 */
import { execFileSync, spawn } from 'node:child_process';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
function appendOutput(current, chunk) {
    if (current.length >= MAX_OUTPUT_BYTES)
        return current;
    const next = current + chunk.toString();
    return next.length > MAX_OUTPUT_BYTES ? next.slice(0, MAX_OUTPUT_BYTES) : next;
}
function killContainer(name) {
    try {
        execFileSync('docker', ['kill', name], { stdio: 'ignore' });
    }
    catch {
        // Container may already have exited.
    }
}
function removeContainer(name) {
    try {
        execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
    }
    catch {
        // Container may not exist.
    }
}
function buildArgv(argv, containerName) {
    if (!containerName || argv[0] !== 'run')
        return argv;
    return ['run', '--name', containerName, ...argv.slice(1)];
}
/**
 * Runs `docker` with the given args; does not throw on non-zero exit.
 */
export function dockerRun(args) {
    const { argv, timeoutMs, containerName } = args;
    if (containerName) {
        removeContainer(containerName);
    }
    const finalArgv = buildArgv(argv, containerName);
    return new Promise((resolve) => {
        const child = spawn('docker', finalArgv, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;
        let timeoutId;
        const finish = (status) => {
            if (settled)
                return;
            settled = true;
            if (timeoutId)
                clearTimeout(timeoutId);
            resolve({ status, stdout, stderr });
        };
        child.stdout?.on('data', (chunk) => {
            stdout = appendOutput(stdout, chunk);
        });
        child.stderr?.on('data', (chunk) => {
            stderr = appendOutput(stderr, chunk);
        });
        if (timeoutMs !== undefined && timeoutMs > 0) {
            timeoutId = setTimeout(() => {
                timedOut = true;
                if (containerName) {
                    killContainer(containerName);
                }
                stderr += `\nTimed out after ${timeoutMs}ms`;
                child.kill('SIGKILL');
            }, timeoutMs);
        }
        child.on('close', (code) => {
            finish(timedOut ? 1 : (code ?? 1));
        });
        child.on('error', (err) => {
            stderr = appendOutput(stderr, Buffer.from(`${err.message}\n`));
            finish(1);
        });
    });
}
/** Like {@link dockerRun} but throws when exit status is non-zero. */
export async function dockerRunOrThrow(args) {
    const { status, stderr, stdout } = await dockerRun(args);
    if (status !== 0) {
        throw new Error(`docker ${args.argv.join(' ')} failed (${status}): ${stderr || stdout}`);
    }
}
/** UID/GID for `docker run --user` so container files match the runner user. */
export function currentUidGid() {
    if (process.platform === 'win32') {
        return { uid: '0', gid: '0' };
    }
    const uid = execFileSync('id', ['-u'], { encoding: 'utf8' }).trim();
    const gid = execFileSync('id', ['-g'], { encoding: 'utf8' }).trim();
    return { uid, gid };
}
//# sourceMappingURL=docker.js.map