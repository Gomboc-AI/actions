/**
 * Applies ORL remediated files from batch work dirs back to the consumer checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { EvaluationBatch, OrlReport, OrlReportRule } from '../types.js';
import { reportPathToRepoPath } from './normalize-report-path.js';
import { normalizeRepoPath } from './paths.js';

function pathsWithChangesFromRule(
  rule: OrlReportRule,
  workspacePath: string
): string[] {
  const paths = new Set<string>();

  for (const raw of Object.keys(rule.files_changed ?? {})) {
    paths.add(
      reportPathToRepoPath({ reportPath: raw, workspacePath })
    );
  }

  if ((rule.fixes ?? 0) > 0 || (rule.changes ?? 0) > 0) {
    for (const file of rule.files ?? []) {
      if (file.path) {
        paths.add(
          reportPathToRepoPath({ reportPath: file.path, workspacePath })
        );
      }
    }
    for (const row of rule.finding_locations ?? []) {
      const loc = row.resolved_location ?? row.original_location;
      if (loc?.file_path) {
        paths.add(
          reportPathToRepoPath({ reportPath: loc.file_path, workspacePath })
        );
      }
    }
  }

  return [...paths];
}

/** Collects repo-relative paths ORL changed in a batch report (not finding-only paths). */
export function pathsWithChangesFromReport(
  report: OrlReport | null,
  workspacePath: string
): string[] {
  if (!report) return [];
  const paths = new Set<string>();
  for (const rule of report.spec?.rules ?? []) {
    for (const p of pathsWithChangesFromRule(rule, workspacePath)) {
      paths.add(normalizeRepoPath(p));
    }
  }
  return [...paths].sort();
}

/** @deprecated Use pathsWithChangesFromReport for remediate copy paths. */
export function pathsFromReport(report: OrlReport | null): string[] {
  if (!report) return [];
  const paths = new Set<string>();
  for (const rule of report.spec?.rules ?? []) {
    for (const p of Object.keys(rule.files_changed ?? {})) {
      paths.add(normalizeRepoPath(p));
    }
    for (const p of Object.keys(rule.paths_with_findings ?? {})) {
      paths.add(normalizeRepoPath(p));
    }
    for (const file of rule.files ?? []) {
      if (file.path) paths.add(normalizeRepoPath(file.path));
    }
  }
  return [...paths].sort();
}

function filesDiffer(src: string, dest: string): boolean {
  if (!fs.existsSync(dest)) return true;
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dest);
  return a.length !== b.length || !a.equals(b);
}

export type ApplyOrlFixesArgs = {
  batchWorkRoot: string;
  workspaceRoot: string;
  batches: EvaluationBatch[];
  reportForBatch: (batchId: string) => OrlReport | null;
  stagedFilesForBatch: (batchId: string) => string[] | null;
};

export type ApplyOrlFixesResult = {
  copiedPaths: string[];
  skippedUnchanged: string[];
  skippedMissing: string[];
};

/**
 * Copies remediated files from each batch work dir into `GITHUB_WORKSPACE`.
 * Candidates: staged manifest ∪ report `files_changed` (workspace-normalized).
 * Copies only when batch file content differs from checkout.
 */
export function applyOrlFixes(args: ApplyOrlFixesArgs): ApplyOrlFixesResult {
  const { batchWorkRoot, workspaceRoot, batches, reportForBatch, stagedFilesForBatch } =
    args;
  const copiedPaths = new Set<string>();
  const skippedUnchanged = new Set<string>();
  const skippedMissing = new Set<string>();

  for (const batch of batches) {
    const workDir = path.join(batchWorkRoot, batch.batchId);
    if (!fs.existsSync(workDir)) continue;

    const reportPaths = pathsWithChangesFromReport(
      reportForBatch(batch.batchId),
      batch.workspacePath
    );
    const manifestPaths = (stagedFilesForBatch(batch.batchId) ?? []).map(
      normalizeRepoPath
    );
    const targetPaths = [...new Set([...manifestPaths, ...reportPaths])].sort();

    for (const file of targetPaths) {
      const src = path.join(workDir, file);
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
        skippedMissing.add(file);
        continue;
      }

      const dest = path.join(workspaceRoot, file);
      if (!filesDiffer(src, dest)) {
        skippedUnchanged.add(file);
        continue;
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      copiedPaths.add(file);
    }
  }

  return {
    copiedPaths: [...copiedPaths].sort(),
    skippedUnchanged: [...skippedUnchanged].sort(),
    skippedMissing: [...skippedMissing].sort(),
  };
}
