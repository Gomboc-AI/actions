/**
 * Normalizes file paths from ORL reports/diagnostics to repo-relative posix paths.
 */
import { isUnderPath, joinRepoPath, normalizeRepoPath } from './paths.js';

/** Strips `/workspace`, `./`, and normalizes slashes. */
export function normalizeReportFilePath(raw: string): string {
  let s = raw.trim().replace(/\\/g, '/');
  s = s.replace(/^\/workspace\/?/, '');
  if (s.startsWith('./')) s = s.slice(2);
  return normalizeRepoPath(s);
}

/** Maps a report-relative path to a repo-relative path for a batch workspace. */
export function reportPathToRepoPath(args: {
  reportPath: string;
  workspacePath: string;
}): string {
  const p = normalizeReportFilePath(args.reportPath);
  const ws = normalizeRepoPath(args.workspacePath);
  if (ws === '.') return p;
  if (p === '.' || p === '') return ws;
  if (isUnderPath({ filePath: p, dirPath: ws })) return p;
  return joinRepoPath({ base: ws, rel: p });
}
