/**
 * Thin wrappers around `@gomboc-ai/gomboc-node-sdk` for PR file language detection.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  detectLanguageId,
  isOrlScannableLanguageFile,
  mapLanguageIdToOrlLanguage,
} from '@gomboc-ai/gomboc-node-sdk';

export type WorkspaceFileArgs = {
  filePath: string;
  workspaceRoot: string;
};

/** Reads file text from the consumer workspace; returns empty string if missing. */
export function readFileContent(args: WorkspaceFileArgs): string {
  const { filePath, workspaceRoot } = args;
  const full = path.join(workspaceRoot, filePath);
  try {
    return fs.readFileSync(full, 'utf8');
  } catch {
    return '';
  }
}

/** Whether the SDK considers this path ORL-scannable (extension + content). */
export function isScannable(args: WorkspaceFileArgs): boolean {
  const { filePath, workspaceRoot } = args;
  const content = readFileContent({ filePath, workspaceRoot });
  return isOrlScannableLanguageFile({ filePath, content });
}

/** ORL CLI `--language` value for a file, or null if not mappable. */
export function orlLanguageForFile(args: WorkspaceFileArgs): string | null {
  const { filePath, workspaceRoot } = args;
  const content = readFileContent({ filePath, workspaceRoot });
  const languageId = detectLanguageId({ filePath, content });
  if (!languageId) return null;
  return mapLanguageIdToOrlLanguage({ languageId, filePath });
}
