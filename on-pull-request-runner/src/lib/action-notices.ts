/**
 * Cross-step notices (auth failures, integrations errors) for the PR summary comment.
 */
import fs from 'node:fs';
import { artifactPath } from './artifacts.js';

export type ActionNotice = {
  level: 'error' | 'warning';
  source: string;
  message: string;
  status?: number;
};

export type ActionNoticesFile = {
  notices: ActionNotice[];
};

const NOTICES_FILE = 'action-notices.json';

function noticesPath(): string {
  return artifactPath(NOTICES_FILE);
}

export function loadActionNotices(): ActionNotice[] {
  const file = noticesPath();
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as ActionNoticesFile;
    return data.notices ?? [];
  } catch {
    return [];
  }
}

export function appendActionNotice(notice: ActionNotice): void {
  const notices = loadActionNotices();
  notices.push(notice);
  fs.mkdirSync(artifactPath(''), { recursive: true });
  fs.writeFileSync(noticesPath(), JSON.stringify({ notices }, null, 2));
}

export function hasErrorNotices(notices: ActionNotice[]): boolean {
  return notices.some((n) => n.level === 'error');
}

export function isAuthFailureNotice(notice: ActionNotice): boolean {
  if (notice.status === 401 || notice.status === 403) return true;
  return /authentication failed|unauthorized|invalid token|expired/i.test(notice.message);
}

export function hasAuthFailureNotices(notices: ActionNotice[]): boolean {
  return notices.some((n) => n.level === 'error' && isAuthFailureNotice(n));
}

function formatNoticeMessage(notice: ActionNotice): string {
  const status = notice.status ? ` (${notice.status})` : '';
  return `**${notice.source}**${status}: ${notice.message.trim()}`;
}

/** Markdown block for PR summary when steps reported errors or warnings. */
export function formatActionNoticesSection(notices: ActionNotice[]): string[] {
  if (!notices.length) return [];

  const errors = notices.filter((n) => n.level === 'error');
  const warnings = notices.filter((n) => n.level === 'warning');
  const lines: string[] = [];

  if (errors.length) {
    lines.push('### Action errors', '');
    if (hasAuthFailureNotices(notices)) {
      lines.push(
        '**Authentication failed.** Your `GOMBOC_ACCESS_TOKEN` may be expired or invalid. Update the repository secret and re-run this workflow.',
        ''
      );
    }
    for (const notice of errors) {
      lines.push(`- ${formatNoticeMessage(notice)}`);
    }
    lines.push('');
  }

  if (warnings.length) {
    lines.push('### Warnings', '');
    for (const notice of warnings) {
      lines.push(`- ${formatNoticeMessage(notice)}`);
    }
    lines.push('');
  }

  return lines;
}

/** Parses Integrations error body into a short human-readable message. */
export function integrationsErrorMessage(status: number, body: string): string {
  const trimmed = body.trim();
  try {
    const json = JSON.parse(trimmed) as {
      error?: { message?: string };
      message?: string;
    };
    const msg = json.error?.message ?? json.message;
    if (msg) return msg;
  } catch {
    /* use raw body */
  }
  return trimmed.slice(0, 500) || `HTTP ${status}`;
}
