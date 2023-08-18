# Gomboc.AI Terraform Remediate Action

## When to use this action

Use this action in a deployment workflow to get remediations to your Terraform code. We require nothing else but your HCL (`.tf`) files!

## Setting up your workflow

Your Gomboc.AI Terraform Remediate workflow should look something like this:

```
name: Gomboc.AI Terraform

on:
  pull_request:
  push:
    branches: [ main ]

permissions:
  id-token: write
  contents: write
  pull-requests write

jobs:
  gomboc:
    runs-on: ubuntu-latest
    steps:
      - name: Gomboc.AI - Terraform Remediate
        uses: Gomboc-AI/actions/terraform/remediate@main
        env:
          FORCE_COLOR: 3
        with:
          access-token: ${{ secrets.GITHUB_TOKEN }} 
          working-directory: tf/
          action: submit-for-review
```

> **Note**
> `secrets.GITHUB_TOKEN` is provided by GitHub and can be used to authenticate on behalf of GitHub Actions. Read more about it [here](https://docs.github.com/en/actions/security-guides/automatic-token-authentication).

> **Note**
> `FORCE_COLOR: 3` will force the GitHub console to output all the colors.

## Permissions

| Permission | Required if | Description |
| --- | --- | --- |
| `id-token: write` | Always | Provides authentication |
| `contents: read` | Always | Access your HCL files |
| `pull-requests: write` | Always | Access to comment on (and create if `action: submit-for-review`) PRs |
| `contents: write` | `action: direct-apply` | Commit remediation(s) |

## Variables

| Variable | Default | Description |
| --- | --- | --- |
| `working-directory` | `.` | The root directory for the Terraform configuration |
| `access-token` |  (Required)  | Access token needed to perform API side effects (`secrets.GITHUB_TOKEN`) |
| `action` | (Required) | `direct-apply` will create a commit on the current branch.<br>`submit-for-review` will create a new PR. |

> **Note**
> that in order to run the `submit-for-review` action you must have enabled **Allow GitHub Actions to create and approve pull requests** in your repository Settings (**Actions>General>Workflow Permission**).
