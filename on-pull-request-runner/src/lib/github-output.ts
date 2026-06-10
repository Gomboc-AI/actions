/**
 * Writes GitHub Actions workflow outputs and step summaries.
 */
import fs from 'node:fs';

/** Appends a `name=value` line to `GITHUB_OUTPUT` for composite action outputs. */
export function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    console.log(`::notice::GITHUB_OUTPUT not set; ${name}=${value}`);
    return;
  }
  fs.appendFileSync(file, `${name}=${value}\n`, 'utf8');
}

/** Appends markdown to `GITHUB_STEP_SUMMARY` (or logs if unset). */
export function appendStepSummary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) {
    console.log(markdown);
    return;
  }
  fs.appendFileSync(file, markdown + '\n', 'utf8');
}
