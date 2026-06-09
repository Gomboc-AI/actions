[![Codacy Badge](https://app.codacy.com/project/badge/Grade/f15d462c0fc54470af360b5578c4fa6f)](https://app.codacy.com/gh/Gomboc-AI/actions/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)

![gomboc logo](assets/gomboc-logo.png)

# Gomboc GitHub Actions

| Action | Description |
|--------|-------------|
| [`on-pull-request-runner/`](on-pull-request-runner/) | **ORL** on pull requests — rules pull, workspace discovery, audit scans, Integrations |
| [`on-pull-request/`](on-pull-request/) | Legacy Gomboc CLI on `pull_request` (OIDC) |
| [`on-schedule/`](on-schedule/) | Legacy Gomboc CLI on `schedule` |

## ORL on pull requests (recommended)

```yaml
- uses: gomboc-ai/actions/on-pull-request-runner@main
  with:
    mode: audit
  env:
    GOMBOC_ACCESS_TOKEN: ${{ secrets.GOMBOC_ACCESS_TOKEN }}
```

See [on-pull-request-runner/README.md](on-pull-request-runner/README.md) for checkout requirements, permissions, and advanced inputs.
