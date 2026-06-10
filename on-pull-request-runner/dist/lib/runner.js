/**
 * Shared entrypoint helpers for composite action Node scripts.
 */
import { setOutput } from './github-output.js';
/** Runs `fn`, logs errors, and exits 1 on failure. */
export async function runMain(fn) {
    try {
        await fn();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(1);
    }
}
/**
 * Signals a benign skip: sets `skip=true` output and exits 0
 * so downstream ORL steps do not run.
 */
export function exitSkip(message) {
    setOutput('skip', 'true');
    console.log(message);
    process.exit(0);
}
//# sourceMappingURL=runner.js.map