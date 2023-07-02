# Gomboc.AI Terraform Remediate Action

### Setting up your workflow

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

`FORCE_COLOR: 3` will force the GitHub console to output all the colors.

### Permissions

| Permission | Description |
| --- | --- |
| `id-token: write` | Required to authenticate you in our service |
| `contents: read` | Required to read your Terraform code |
| `contents: write` | Required if `action: direct-apply` |
| `pull-requests: write` | Required if `action: submit-for-review` |

### Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `gomboc-config` | No |  `gomboc.yaml` | Path to Gomboc.AI's configuration file |
| `working-directory` | No | `.` | The root directory for the Terraform configuration |
| `access-token` | Yes |   | Access token needed to perform API side effects (`secrets.GITHUB_TOKEN`) |
| `action` | Yes |   | `direct-apply` will create a commit on the current branch. `submit-for-review` will create a new PR. |

> **Note**
> that in order to run the `submit-for-review` action you must have enabled **Allow GitHub Actions to create and approve pull requests** in **Workflow Permissionw** in the **Actions/General** tab of your repository Settings.

### About Gomboc.AI's configuration file

It is a YAML file that specifies different parameters for the remediate action.

Here's an example:

```
policies: 
  must-implement:
    - Deletion Protection
    - Request Tracing
    - Client Authentication via IAM SigV4
    - Skip Terraform Destroy
```

| Element | Required | Description |
| --- | --- | --- |
| <kbd>policies.must-implement</kbd> | Yes | A list of capabilities that will be enforced |