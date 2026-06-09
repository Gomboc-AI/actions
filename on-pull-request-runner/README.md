# Gomboc ORL On Pull Request Runner

Composite GitHub Action that runs [ORL](https://github.com/Gomboc-AI/orl) on **pull request** diffs in audit or remediate mode.

Full documentation, usage examples, input reference, and branch protection setup:\
**[docs.gomboc.ai → GitHub Actions — ORL Runner](https://docs.gomboc.ai/integrations/continuous-integration-ci-build-systems/github-actions#orl-based-github-action-on-pull-request-runner)**

## Quick start

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

      - uses: gomboc-ai/actions/on-pull-request-runner@v1
        with:
          mode: audit
          # fail-on-findings: true   # uncomment to block the pipeline on findings
        env:
          GOMBOC_ACCESS_TOKEN: ${{ secrets.GOMBOC_ACCESS_TOKEN }}
```

For remediate mode (stacked PR), see [`examples/consumer-workflow.yml`](examples/consumer-workflow.yml) or the [full docs](https://docs.gomboc.ai/integrations/continuous-integration-ci-build-systems/github-actions#orl-based-github-action-on-pull-request-runner).

## Maintainers

```bash
cd on-pull-request-runner
cp .npmrc.example .npmrc   # add your token line (file is gitignored)
npm install
npm run build
npm test
```

For `.npmrc`, prefer `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` and export a PAT with `read:packages`. Never commit `.npmrc`.

Commit `dist/` after build. On release tags, also commit `package-lock.json` and production `node_modules/`.

`@gomboc-ai/gomboc-node-sdk` is on GitHub Packages. CI and the composite action use `GITHUB_TOKEN` (`packages: read`); no extra PAT needed in this repo when the package grants the `actions` repository access.