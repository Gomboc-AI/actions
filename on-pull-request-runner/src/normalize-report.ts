/**
 * Composite step: trim merged ORL report for Integrations and PR summary consumption.
 */
import fs from 'node:fs';
import yaml from 'yaml';
import { artifactPath } from './lib/artifacts.js';
import { normalizeOrlReport } from './lib/normalize-orl-report.js';
import { runMain } from './lib/runner.js';
import type { OrlReport } from './types.js';

async function main(): Promise<void> {
  const reportPath = artifactPath('merged-report.yaml');
  const report = yaml.parse(fs.readFileSync(reportPath, 'utf8')) as OrlReport;
  const normalized = normalizeOrlReport(report);
  fs.writeFileSync(
    artifactPath('normalized-report.json'),
    JSON.stringify(normalized, null, 2)
  );
  console.log('Normalized report written');
}

runMain(main);
