/**
 * Composite step: trim merged ORL report for Integrations and PR summary consumption.
 */
import fs from 'node:fs';
import yaml from 'yaml';
import { artifactPath } from './lib/artifacts.js';
import { runMain } from './lib/runner.js';
const DROP_ANNOTATION_KEYS = [
    'example',
    'graph',
    'code-fix-id',
    'resource-key',
    'risk/statement',
    'impact/statement',
];
function trimDescription(desc, max = 500) {
    if (!desc)
        return desc;
    return desc.length > max ? desc.slice(0, max) + '…' : desc;
}
function filterAnnotations(annotations) {
    if (!annotations)
        return undefined;
    const out = {};
    for (const [k, v] of Object.entries(annotations)) {
        if (DROP_ANNOTATION_KEYS.some((drop) => k.includes(drop)))
            continue;
        out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
}
function normalizeRule(rule) {
    return {
        findings: rule.findings ?? 0,
        fixes: rule.fixes ?? 0,
    };
}
/**
 * Produces Integrations-friendly JSON: totals, trimmed metadata, empty rules array.
 * Rule-level detail remains in `merged-report.yaml` artifacts.
 */
export function normalizeOrlReport(report) {
    const spec = report.spec;
    let totalFindings = 0;
    let totalFixes = 0;
    for (const rule of spec.rules ?? []) {
        const n = normalizeRule(rule);
        totalFindings += n.findings;
        totalFixes += n.fixes;
    }
    return {
        type: 'Report',
        version: 'v1',
        metadata: {
            name: report.metadata.name,
            display_name: report.metadata.display_name,
            description: trimDescription(report.metadata.description),
        },
        workspace: spec.workspace ?? '.',
        language: spec.language ?? 'unknown',
        rules_applied: spec.rules_applied ?? spec.rules?.length ?? 0,
        findings: spec.findings ?? totalFindings,
        fixes: spec.fixes ?? totalFixes,
        changes: spec.changes ?? 0,
        rules: [],
        errors: spec.errors ?? [],
    };
}
async function main() {
    const reportPath = artifactPath('merged-report.yaml');
    const report = yaml.parse(fs.readFileSync(reportPath, 'utf8'));
    const normalized = normalizeOrlReport(report);
    fs.writeFileSync(artifactPath('normalized-report.json'), JSON.stringify(normalized, null, 2));
    console.log('Normalized report written');
}
runMain(main);
//# sourceMappingURL=normalize-report.js.map