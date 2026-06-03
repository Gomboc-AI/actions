# Gomboc ORL On Pull Request Runner

Composite GitHub Action that runs [ORL](https://github.com/Gomboc-AI/orl) on **pull request** diffs: discovers touched workspaces, remediates in audit mode, posts results to Integrations, and leaves a summary PR comment.

## Requirements

- Workflow trigger: `pull_request` only (`opened`, `synchronize`, `reopened`)
- Check out the **PR head** with full history before calling this action
- Secret / env: `GOMBOC_ACCESS_TOKEN` (Gomboc PAT)
- Permissions: `contents: read`, `pull-requests: write`, `packages: read` (required to install `@gomboc-ai/gomboc-node-sdk` from GitHub Packages — see note below)

## Minimal usage

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
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0

      - uses: gomboc-ai/actions/on-pull-request-runner@v1
        with:
          mode: audit
        env:
          GOMBOC_ACCESS_TOKEN: ${{ secrets.GOMBOC_ACCESS_TOKEN }}
```

See [examples/consumer-workflow.yml](examples/consumer-workflow.yml).

## Phase 1 scope

| Supported | Not yet |
|-----------|---------|
| `mode: audit` | `mode: remediate` (stacked remediation PR) |
| Summary PR comment | Inline review comments on lines |
| Git-derived PR file scope | `push` / `schedule` triggers |

## How it works

1. Resolve rules channel from JWT (or `orl-channel` input)
2. `orl rules pull` into a cached rulespace
3. `git diff` PR base..head → scannable files and touch seeds
4. `orl detect-language` per touch seed → touched workspaces
5. Parallel `orl remediate` per workspace × language (default concurrency: 3)
6. Merge reports → Integrations POST → summary comment → artifacts

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `mode` | *(required)* | `audit` (Phase 1). `remediate` fails fast until Phase 3. |
| `max-changed-files` | `50` | Max PR-changed paths; fails if exceeded |
| `orl-channel` | `""` | Rules channel; empty = JWT `tenantId/accounts/default` |
| `orl-version` | `v1.3.6` | ORL image tag when `orl-image` empty |
| `orl-image` | `""` | Full Docker image ref override |
| `rules-service-url` | `https://rules.app.gomboc.ai` | Rules service base URL |
| `integrations-service-url` | `https://integrations.app.gomboc.ai` | Integrations base URL |
| `integrations-enabled` | `true` | Set `false` to skip Integrations POST |
| `scan-timeout-seconds` | `90` | Per-batch remediate timeout |

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
