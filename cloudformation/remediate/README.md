# <img src="../../assets/cloudformation-logo.png" style="margin-right:10px" width="24"/> Gomboc.AI CloudFormation Remediate Action

## When to use this action

Use this action in a deployment workflow to get remediations to your CloudFormation code. It can be used with either `on:push` or `on:pull_request` [GitHub events](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)  

## Quickstart guide 

We recommend setting up our action on `pull_request`. Every time you open a PR with changes to IaC files, we will discover and scan them.

You can copy and paste these workflows from our [examples](/cloudformation/remediate/examples/).

## Setting up your own workflow

Your Gomboc.AI CloudFormation Remediate workflow should look something like this:

```
name: Gomboc.AI CloudFormation

permissions:
  id-token: write
  contents: read

on:
  pull_request:

jobs:
  gomboc:
    runs-on: ubuntu-latest
    steps:
      - name: Gomboc.AI - CloudFormation Remediate
        uses: Gomboc-AI/actions/cloudformation/remediate@main
```

> **Note**
> Include the permissions as shown above. `id-token:write` is needed to authenticate you, `contents:read` is needed to discover IaC files with changes
