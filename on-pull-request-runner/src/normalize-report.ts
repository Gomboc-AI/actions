/**
 * Composite step: trim merged ORL report for Integrations and PR summary consumption.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { artifactPath } from './lib/artifacts.js';
import { normalizeOrlReport } from './lib/normalize-orl-report.js';
import { runMain } from './lib/runner.js';
import type { OrlReport } from './types.js';

function getLineSnippet(args: {
  workspaceRoot: string;
  filePath: string;
  startLine: number;
  endLine?: number;
}): { before: string; target: string; after: string } | null {
  const { workspaceRoot, filePath, startLine, endLine = startLine } = args;
  try {
    const fullPath = path.join(workspaceRoot, filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);

    const startIdx = startLine - 1;
    const endIdx = endLine - 1;

    if (startIdx < 0 || startIdx >= lines.length) {
      return null;
    }

    const beforeLines = lines.slice(Math.max(0, startIdx - 3), startIdx);
    const targetLines = lines.slice(startIdx, endIdx + 1);
    const afterLines = lines.slice(endIdx + 1, endIdx + 1 + 3);

    return {
      before: beforeLines.join('\n'),
      target: targetLines.join('\n'),
      after: afterLines.join('\n'),
    };
  } catch (err) {
    console.error(`Failed to extract snippet for ${filePath}:${startLine}: ${err}`);
    return null;
  }
}

async function main(): Promise<void> {
  const reportPath = artifactPath('merged-report.yaml');
  const report = yaml.parse(fs.readFileSync(reportPath, 'utf8')) as OrlReport;
  const normalized = normalizeOrlReport(report);

  const workspaceRoot = process.env.GITHUB_WORKSPACE ?? '';

  if (normalized.rules) {
    for (const rule of normalized.rules as any[]) {
      for (const loc of rule.finding_locations ?? []) {
        const original = loc.original_location;
        if (original?.file_path && original?.start_line) {
          const snippet = getLineSnippet({
            workspaceRoot,
            filePath: original.file_path,
            startLine: original.start_line,
            endLine: original.end_line,
          });
          if (snippet) {
            loc.snippet = snippet;
          }
        }
      }
    }
  }

  fs.writeFileSync(
    artifactPath('normalized-report.json'),
    JSON.stringify(normalized, null, 2)
  );
  console.log('Normalized report written');
}

runMain(main);
