/**
 * Cross-step notices (auth failures, integrations errors) for the PR summary comment.
 */
import fs from 'node:fs';
import { artifactPath } from './artifacts.js';
const NOTICES_FILE = 'action-notices.json';
function noticesPath() {
    return artifactPath(NOTICES_FILE);
}
export function loadActionNotices() {
    const file = noticesPath();
    if (!fs.existsSync(file))
        return [];
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return data.notices ?? [];
    }
    catch {
        return [];
    }
}
export function appendActionNotice(notice) {
    const notices = loadActionNotices();
    notices.push(notice);
    fs.mkdirSync(artifactPath(''), { recursive: true });
    fs.writeFileSync(noticesPath(), JSON.stringify({ notices }, null, 2));
}
export function hasErrorNotices(notices) {
    return notices.some((n) => n.level === 'error');
}
export function isAuthFailureNotice(notice) {
    if (notice.status === 401 || notice.status === 403)
        return true;
    return /authentication failed|unauthorized|invalid token|expired/i.test(notice.message);
}
export function hasAuthFailureNotices(notices) {
    return notices.some((n) => n.level === 'error' && isAuthFailureNotice(n));
}
function formatNoticeMessage(notice) {
    const status = notice.status ? ` (${notice.status})` : '';
    return `**${notice.source}**${status}: ${notice.message.trim()}`;
}
/** Markdown block for PR summary when steps reported errors or warnings. */
export function formatActionNoticesSection(notices) {
    if (!notices.length)
        return [];
    const errors = notices.filter((n) => n.level === 'error');
    const warnings = notices.filter((n) => n.level === 'warning');
    const lines = [];
    if (errors.length) {
        lines.push('### Action errors', '');
        if (hasAuthFailureNotices(notices)) {
            lines.push('**Authentication failed.** Your `GOMBOC_ACCESS_TOKEN` may be expired or invalid. Update the repository secret and re-run this workflow.', '');
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
export function integrationsErrorMessage(status, body) {
    const trimmed = body.trim();
    try {
        const json = JSON.parse(trimmed);
        const msg = json.error?.message ?? json.message;
        if (msg)
            return msg;
    }
    catch {
        /* use raw body */
    }
    return trimmed.slice(0, 500) || `HTTP ${status}`;
}
//# sourceMappingURL=action-notices.js.map