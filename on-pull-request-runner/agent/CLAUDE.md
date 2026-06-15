# Gomboc CSPM Agent — Autonomous CI Mode

You are running inside a GitHub Actions workflow. There is no human present.
Never emit interactive prompts, ask for confirmation, or wait for input.
All decisions that the `cspm-triage` skill would normally surface as `(y/n)` gates
are resolved autonomously using the rules in this file.

---

## Environment

| Variable | Value |
|---|---|
| `GOMBOC_ARTIFACTS_ROOT` | `$RUNNER_TEMP/gomboc-orl` — runner artifact directory |
| `GOMBOC_SKILLS_ROOT` | Root of the gomboc-enterprise-skills checkout (`$GITHUB_WORKSPACE/.gomboc-enterprise-skills`) |
| `GITHUB_WORKSPACE` | Tenant repo checkout root |

Skill scripts are at:
`$GOMBOC_SKILLS_ROOT/plugins/gomboc/skills/cspm-triage/scripts/`

Runner artifacts (read-only inputs to the agent):
```
$GOMBOC_ARTIFACTS_ROOT/
  evaluation-batches.json   ← authoritative language + workspace per batch
  normalized-report.json    ← totals only (rules: [] is intentional — not a bug)
  rules-dir.txt             ← baseline rulespace path (never write here)
  touched-workspaces.json   ← PR-scoped changed files (languages[] is always empty — use evaluation-batches.json for language)
  batches/batch-N/
    report.yaml             ← full per-rule report; filter to findings > 0 for lineage
    staged-files.json
  orl-workspace/batch-N/    ← staged + post-remediation workspace (target for orl remediate -r)
  run-complete.json         ← {"ok": true/false}; abort if false
```

---

## Task

Run the `cspm-triage` skill against the PR workspace. Triage the top-matching
CSPM alert, apply the resulting ORL rule to the staged workspace, and output a
structured result block. This run is **audit mode only** — see delivery constraints.

---

## Inputs

Read these from the environment:

| Variable | Required | Description |
|---|---|---|
| `CSPM_API_URL` | yes | Base URL of the cspm-service |
| `CSPM_API_TOKEN` | yes | Bearer token for the cspm-service |
| `GOMBOC_API_TOKEN` | yes | Bearer token for the Gomboc Rules Service |
| `GOMBOC_RULES_SERVICE_URL` | no | Rules service override; default `https://rules.dev.gcp.gomboc.ai` for CI runs |
| `GITHUB_TOKEN` | yes | GitHub PAT (needed by the skill even in audit mode) |
| `CSPM_OBSERVATION_ID` | no | If set, triage this specific observation; skip auto-selection |
| `CSPM_SOURCE_PATH` | no | Override source path; default: derive from `evaluation-batches.json` |

**PR-triggered mode** (`evaluation-batches.json` exists): the source path is the
runner's staged workspace —
`$GOMBOC_ARTIFACTS_ROOT/orl-workspace/batch-0/<workspacePath from evaluation-batches.json>`.
When applying a rule with `orl remediate -r`, target this staged path so the CSPM
fix layers on top of channel-rule fixes already applied there.

**Dispatch mode** (`evaluation-batches.json` absent): use `$CSPM_SOURCE_PATH` if
set, otherwise `$GITHUB_WORKSPACE`. Apply `orl remediate -r` directly against that
path.

---

## Autonomous overrides

| Prompt in cspm-triage | Autonomous behavior |
|---|---|
| Phase 0: observation ID | Use `$CSPM_OBSERVATION_ID` if set; otherwise run `--top` auto-selection |
| Phase 0: source path | Derive from `evaluation-batches.json` or use `$CSPM_SOURCE_PATH` |
| Phase 0: auto-select top candidate | Always yes |
| Phase 1: soft gates | Auto-acknowledge; log reason to triage artifact `notes` field |
| Phase 1: hard stops | Write `deferred` artifact; post PR comment (see below); exit 0 |
| Step 3: confidence HIGH | Proceed |
| Step 3: confidence MEDIUM | Proceed; add warning to triage artifact and output block |
| Step 3: confidence LOW | Trigger retry (advance to next candidate; see alert selection) |
| Step 4 / Step 7: "Apply? (y/n)" | Always yes; if > 10 files affected, log count but proceed |
| Tier 2 triage brief | Write to artifact only; do not pause for user |

---

## Alert selection and retries

1. **Pre-flight ranking (once):** fetch top-10 candidates scored against the source path:
   ```bash
   python3 .../fetch_observation.py --top --limit 10 \
     --source-path <staged_workspace_path> --summary
   ```
   Order the shortlist: `Match=yes` first, then `Match=?`. Discard `Match=no`.

2. **Evaluate candidate #1 immediately.** Do not pre-evaluate other candidates.
   A Tier 1 / HIGH confidence result proceeds with no extra latency.

3. **Retry trigger** (advance to next candidate, max 3 total evaluations):
   - Tier assignment is 2 or lower (no usable IaC match in the provided code), or
   - Step 3 confidence gate returns LOW.

4. **Transient errors** (network failure, tool crash, script exit non-zero):
   hard failure — do not consume a retry slot. Exit with error output block.

5. **After 3 evaluations all fail:** write `deferred` triage artifact with
   `triage-status=deferred` and `notes` explaining each attempt. Post a PR comment:
   ```
   **Gomboc CSPM:** No actionable alert found for this PR's workspaces
   (3 candidates evaluated, none reached Tier 1 / HIGH confidence).
   Manual triage recommended.
   ```
   Then exit 0.

---

## Delivery constraints (audit mode)

This run is **audit-only**. The following actions are **prohibited**:

- Creating branches or commits in the tenant repo (`$GITHUB_WORKSPACE`)
- Opening PRs in the tenant repo
- Posting a Wiz resolution note (`add_observation_note.py`) — also blocked at the script level by `CSPM_DRY_RUN=true`

The following actions are **required**:

- Build and release the ORL rule to the dev rules service
  (`GOMBOC_RULES_SERVICE_URL` defaults to `https://rules.dev.gcp.gomboc.ai`)
- Set the `contributed-by` annotation to `$CSPM_TENANT_ORG` if set, otherwise `gomboc-ai`
- Apply the rule to the staged workspace via `orl remediate -r <package>`
- Write the triage artifact to `$GITHUB_WORKSPACE/.gomboc/triage/`

---

## Rule attribution (lineage)

Every fix must be traceable. When reading rule names from `batches/batch-N/report.yaml`:
- ORL appends numeric suffixes (`000`, `001`) to instance names — strip these
- Use the `ruleset-name` annotation or the `classifications[]` array as the stable key
- The lineage chain is: `ruleset-name -> classifications[] -> control ID`
- Attribute every fix to this chain, not to which process or pass produced it

Rules tagged `gomboc-ai/remediation-assessment: REMEDIATION_WITH_INPUT` produce
`USER_INPUT_N` placeholders in fixed files. Flag these explicitly:
- Triage artifact: `remediation_type: REMEDIATION_WITH_INPUT`
- Output block: include `REMEDIATION_TYPE: REMEDIATION_WITH_INPUT`
- Do not post a resolution note for a file that still contains `USER_INPUT_N`

---

## Output

After completing (success, deferred, or error), print this block so the runner
step can parse it:

```
CSPM_TRIAGE_RESULT_START
STATUS: success | deferred | error
TIER: 1 | 2 | 3 | 4 | n/a
CONFIDENCE: HIGH | MEDIUM | LOW | n/a
CANDIDATES_EVALUATED: <1–3>
OBSERVATION_ID: <id or "none">
CONTROL_ID: <control-id or "none">
SEVERITY: <severity or "none">
RULE_NAME: <ruleset-name or "none">
RULE_RELEASED: true | false
REMEDIATION_TYPE: FULL_REMEDIATION | REMEDIATION_WITH_INPUT | n/a
FILES_SCANNED: <N>
VIOLATIONS_FOUND: <N>
ARTIFACT_PATH: <absolute path to triage JSON or "none">
DEFERRED_REASON: <one-line reason or "none">
CSPM_TRIAGE_RESULT_END
```

Always emit this block, even on hard failure. On error, set `STATUS: error` and
put the failure summary in `DEFERRED_REASON`.
