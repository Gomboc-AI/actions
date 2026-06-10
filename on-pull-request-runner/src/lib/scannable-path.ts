/**
 * Matches ORL report paths to PR-scannable repo-relative paths.
 */
import { normalizeReportFilePath } from './normalize-report-path.js';

/** Resolves a repo-relative scannable path, allowing suffix/basename matches. */
export function resolveScannablePath(
  repoPath: string,
  prScannableFiles: Set<string>
): string | null {
  const norm = normalizeReportFilePath(repoPath);
  if (prScannableFiles.has(norm)) return norm;

  const suffixMatches = [...prScannableFiles].filter(
    (f) => f === norm || f.endsWith(`/${norm}`)
  );
  if (suffixMatches.length === 1) return suffixMatches[0];

  const base = norm.split('/').pop() ?? norm;
  const baseMatches = [...prScannableFiles].filter(
    (f) => f === base || f.endsWith(`/${base}`)
  );
  if (baseMatches.length === 1) return baseMatches[0];

  return null;
}
