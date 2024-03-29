# <img src="../../assets/terraform-logo.png" style="margin-right:10px" width="24"/> Gomboc.AI Terraform Remediate Action

## When to use this action

Use this action in a deployment workflow to get remediations to your Terraform code. It can be used with either `on:push` or `on:pull_request` [GitHub events](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)  

## Quickstart guide 

We recommend starting with these two workflows:
  - **On Demand Execution**: Trigger our action from GitHub's UI for a quick healthcheck
  - **On Pull Requests**: Trigger our action everytime you make changes to your IaC

You can copy and paste these workflows from our [examples](/terraform/remediate/examples/). Otherwise, read on for more details.

## Setting up your own workflow

Your Gomboc.AI Terraform Remediate workflow should look something like this:

```
name: Gomboc.AI Terraform

permissions:
  id-token: write
  contents: read

on:
  pull_request:
  push:
    branches: [ main ]

jobs:
  gomboc:
    runs-on: ubuntu-latest
    steps:
      - name: Gomboc.AI - Terraform Remediate
        uses: Gomboc-AI/actions/terraform/remediate@main
        with:
          action: submit-for-review
```

> **Note**
> Include the permissions as shown above. `id-token:write` is needed to authenticate you, `contents:read` is needed to discover IaC files with changes. 

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `action` | (Required) | `direct-apply` will create a commit on the current branch.<br>`submit-for-review` will create a new PR. |
