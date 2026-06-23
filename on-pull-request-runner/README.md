# Gomboc ORL On Pull Request Runner

Composite GitHub Action that runs [ORL](https://github.com/Gomboc-AI/orl) on **pull request** diffs: discovers touched workspaces, remediates in audit or remediate mode, posts results to Integrations, and either leaves inline review comments (audit) or opens a stacked remediation PR (remediate).

## Requirements

- Workflow trigger: `pull_request` only (`opened`, `synchronize`, `reopened`)
- Check out the **PR head** with full history before calling this action
- Secret / env: `GOMBOC_ACCESS_TOKEN` (Gomboc PAT)
- Permissions:
  - **Audit:** `contents: read`, `pull-requests: write`, `packages: read`
  - **Remediate:** add `contents: write` (push bot remediation branch)

## Minimal usage (audit)

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  packages: read

jobs:
  gomboc-orl:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0

      - uses: gomboc-ai/actions/on-pull-request-runner@main
        with:
          mode: audit
        env:
          GOMBOC_ACCESS_TOKEN: ${{ secrets.GOMBOC_ACCESS_TOKEN }}
```

See [examples/consumer-workflow.yml](examples/consumer-workflow.yml).

## Remediate mode (stacked PR)

When ORL produces fixes, the action pushes a bot branch and opens a PR **into your feature branch** (stacked on the triggering PR):

```yaml
jobs:
  gomboc-orl:
    # Skip stacked remediation PRs — they must not re-run remediate mode.
    if: |
      !startsWith(github.event.pull_request.head.ref, 'gomboc/orl-remediation-') &&
      github.event.pull_request.head.ref != 'gomboc/orl-remediation'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      packages: read
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0

      - uses: gomboc-ai/actions/on-pull-request-runner@main
        with:
          mode: remediate
        env:
          GOMBOC_ACCESS_TOKEN: ${{ secrets.GOMBOC_ACCESS_TOKEN }}
```

The default bot branch prefix is `gomboc/orl-remediation` (`{prefix}-{pr_number}`). If you override `remediation-branch-prefix`, update the job `if` to match.

**Fork PRs:** if the PR head repo differs from the base repo (`pull_request.head.repo.full_name != github.repository`), push is skipped with a warning. Do not use `pull_request_target` to work around this unless you understand the security tradeoffs.

Remediation uses `GITHUB_TOKEN` to push and open the stacked PR; `GOMBOC_ACCESS_TOKEN` is still required for rules pull and Integrations.

**When no remediation PR is opened:** the action copies ORL-modified files from the isolated batch workspace back into your checkout. If ORL reports `fixes=0` and `changes=0` (common with exit code 2 — findings remain), there is nothing to commit. Check the job log for `ORL report totals: findings=…, fixes=…, changes=…` and the `Open remediation PR` step output.

**“CI&CD” or other PR labels:** those come from the Gomboc Integrations backend when `post-integrations` runs with `effect: SubmitForReview`. That step runs once after mode-specific work (audit comments or remediation PR), so remediate mode can include `scmContext.resultingPullRequest` when a remediation PR was opened.

## Supported features

| Feature | Audit | Remediate |
|---------|-------|-----------|
| Inline review comments on changed lines | yes | no |
| Summary PR comment | yes | no |
| Stacked remediation PR | no | yes (with audit-style body + inline comments) |
| Integrations telemetry | yes | yes |
| `fail-on-findings` | yes | no |
| Fork PR push | n/a | skipped |

## How it works

1. Resolve rules channel from JWT (or `orl-channel` input) via Rules Service channel lookup
2. `orl rules pull` into a cached rulespace
3. `git diff` PR base..head → scannable files and touch seeds
4. `orl detect-language` per touch seed → touched workspaces
5. Parallel `orl remediate` per workspace × language (default concurrency: 3)
6. Merge reports → normalize report
7. **Audit:** inline + summary PR comments → Integrations POST → artifacts
8. **Remediate:** replay per-finding ORL hook commits onto bot branch (fallback: single commit) → push → open stacked PR → Integrations POST (includes `resultingPullRequest` when a remediation PR is opened) → artifacts

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `mode` | *(required)* | `audit` or `remediate` |
| `max-changed-files` | `50` | Max PR-changed paths; fails if exceeded |
| `orl-channel` | `""` | Rules channel; empty = resolve via Rules Service (global → set/default → accounts/default → default) |
| `orl-version` | `v1.4.1-latest` | ORL image tag when `orl-image` empty |
| `orl-image` | `""` | Full Docker image ref override |
| `rules-service-url` | `https://rules.app.gomboc.ai` | Rules service base URL |
| `integrations-service-url` | `https://integrations.app.gomboc.ai` | Integrations base URL |
| `portal-service-url` | `https://app.gomboc.ai` | Portal base URL for rule links in inline comments |
| `integrations-enabled` | `true` | Set `false` to skip Integrations POST |
| `scan-timeout-seconds` | `""` | Per-batch Docker run timeout (hard kill); empty = no limit |
| `orl-timeout` | `""` | ORL global `--timeout` (e.g. `10m`); empty = no limit |
| `orl-rule-timeout` | `10s` | ORL `--default-rule-timeout` per-rule audit cap |
| `remediation-branch-prefix` | `gomboc/orl-remediation` | Bot branch prefix for remediate mode (`{prefix}-{pr_number}`) |
| `comment-max-per-pr` | `50` | Max inline review comments per PR run (audit) |
| `fail-on-findings` | `false` | Audit only: fail when findings or changes &gt; 0 |

### Blocking on findings (audit)

```yaml
- uses: gomboc-ai/actions/on-pull-request-runner@main
  with:
    mode: audit
    fail-on-findings: true
  env:
    GOMBOC_ACCESS_TOKEN: ${{ secrets.GOMBOC_ACCESS_TOKEN }}
```

When `fail-on-findings` is `false` (default), the job succeeds after reporting violations so you can review inline comments without blocking merges.

## Maintainers

```bash
cd on-pull-request-runner
cp .npmrc.example .npmrc   # add your token line to .npmrc (file is gitignored)
npm install
npm run build
npm test
```

For `.npmrc`, prefer `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` and export a PAT with `read:packages`, or paste the token directly into `.npmrc` — never commit that file.

Commit `dist/` after build. Optionally commit `package-lock.json` and production `node_modules/` on release tags so consumers skip the runtime install step.

`@gomboc-ai/gomboc-node-sdk` is on GitHub Packages (`.npmrc` maps `@gomboc-ai` and `@Gomboc-AI` to `https://npm.pkg.github.com`). **Visibility “public” does not mean anonymous:** GitHub’s npm registry still requires a token with `read:packages` for every install ([docs](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)). CI and the composite action use the workflow’s `GITHUB_TOKEN` (`packages: read`); no extra PAT is needed in this repo when the package grants the `actions` repository access.
