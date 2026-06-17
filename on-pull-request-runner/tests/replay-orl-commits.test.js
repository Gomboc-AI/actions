import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  batchPathToRepoPath,
  listCommitsFromBatchGit,
  listCommitsFromManifest,
  replayRemediationCommits,
  resolveBatchGitRoot,
} from '../dist/lib/replay-orl-commits.js';
import { configureGitIdentity } from '../dist/lib/git.js';

function git(args, cwd) {
  execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function initRepo(cwd, files) {
  git(['init'], cwd);
  for (const [file, content] of Object.entries(files)) {
    const dest = path.join(cwd, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  configureGitIdentity(cwd);
  git(['add', '-A'], cwd);
  git(['commit', '-m', 'baseline'], cwd);
}

describe('replay-orl-commits', () => {
  it('maps workspace-relative hook paths to repo paths', () => {
    assert.equal(
      batchPathToRepoPath('dolphinscheduler-alert.tf', 'deploy/terraform/aws'),
      'deploy/terraform/aws/dolphinscheduler-alert.tf'
    );
  });

  it('finds git root inside nested batch workspace', () => {
    const batchWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-batch-nested-'));
    const gitRoot = path.join(batchWorkDir, 'deploy/terraform/aws');
    fs.mkdirSync(gitRoot, { recursive: true });
    initRepo(gitRoot, { 'main.tf': 'v1\n' });

    assert.equal(
      resolveBatchGitRoot(batchWorkDir, 'deploy/terraform/aws'),
      gitRoot
    );
  });

  it('lists hook commits from batch git history', () => {
    const batchWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-batch-'));
    initRepo(batchWorkDir, { 'main.tf': 'v1\n' });

    fs.writeFileSync(path.join(batchWorkDir, 'main.tf'), 'v2\n');
    git(['add', 'main.tf'], batchWorkDir);
    git(['commit', '-m', 'fix(gomboc): rule-a (main.tf)'], batchWorkDir);

    fs.writeFileSync(path.join(batchWorkDir, 'other.tf'), 'new\n');
    git(['add', 'other.tf'], batchWorkDir);
    git(['commit', '-m', 'fix(gomboc): rule-b (other.tf)'], batchWorkDir);

    const commits = listCommitsFromBatchGit(batchWorkDir, '.');
    assert.equal(commits.length, 2);
    assert.equal(commits[0].message, 'fix(gomboc): rule-a (main.tf)');
    assert.deepEqual(commits[0].files, ['main.tf']);
    assert.equal(commits[1].message, 'fix(gomboc): rule-b (other.tf)');
    assert.deepEqual(commits[1].files, ['other.tf']);
  });

  it('reads commits from manifest.jsonl fallback with workspace prefix', () => {
    const batchWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-manifest-'));
    const diagDir = path.join(batchWorkDir, '.orl', 'diagnostics');
    fs.mkdirSync(diagDir, { recursive: true });
    fs.writeFileSync(
      path.join(diagDir, 'manifest.jsonl'),
      [
        '{"rule":"rule-a","message":"fix(gomboc): rule-a (main.tf)","files":["main.tf"]}',
        '{"rule":"rule-b","message":"fix(gomboc): rule-b (other.tf)","files":["other.tf"]}',
      ].join('\n')
    );
    fs.mkdirSync(path.join(batchWorkDir, 'deploy/terraform/aws'), { recursive: true });
    fs.writeFileSync(
      path.join(batchWorkDir, 'deploy/terraform/aws/main.tf'),
      'v2\n'
    );
    fs.writeFileSync(
      path.join(batchWorkDir, 'deploy/terraform/aws/other.tf'),
      'new\n'
    );

    const commits = listCommitsFromManifest(batchWorkDir, 'deploy/terraform/aws');
    assert.equal(commits.length, 2);
    assert.equal(commits[0].message, 'fix(gomboc): rule-a (main.tf)');
    assert.deepEqual(commits[0].files, ['deploy/terraform/aws/main.tf']);
  });

  it('replays per-finding commits onto the consumer checkout', () => {
    const batchWorkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-batch-root-'));
    const batchWorkDir = path.join(batchWorkRoot, 'batch-0');
    fs.mkdirSync(batchWorkDir, { recursive: true });
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-consumer-'));

    initRepo(batchWorkDir, { 'main.tf': 'v1\n' });
    initRepo(workspaceRoot, { 'main.tf': 'v1\n' });

    fs.writeFileSync(path.join(batchWorkDir, 'main.tf'), 'v2\n');
    git(['add', 'main.tf'], batchWorkDir);
    git(['commit', '-m', 'fix(gomboc): rule-a (main.tf)'], batchWorkDir);

    fs.writeFileSync(path.join(batchWorkDir, 'other.tf'), 'new\n');
    git(['add', 'other.tf'], batchWorkDir);
    git(['commit', '-m', 'fix(gomboc): rule-b (other.tf)'], batchWorkDir);

    configureGitIdentity(workspaceRoot);
    const replay = replayRemediationCommits({
      batches: [{ batchId: 'batch-0', workspacePath: '.', orlLanguage: 'terraform', files: [] }],
      batchWorkRoot,
      workspaceRoot,
    });

    assert.equal(replay.commitCount, 2);
    assert.deepEqual(replay.allFiles, ['main.tf', 'other.tf']);
    assert.equal(fs.readFileSync(path.join(workspaceRoot, 'main.tf'), 'utf8'), 'v2\n');
    assert.equal(fs.readFileSync(path.join(workspaceRoot, 'other.tf'), 'utf8'), 'new\n');

    const log = execFileSync('git', ['log', '--oneline'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });
    assert.match(log, /fix\(gomboc\): rule-a \(main.tf\)/);
    assert.match(log, /fix\(gomboc\): rule-b \(other.tf\)/);
  });

  it('replays nested workspace hook commits using repo-relative paths', () => {
    const batchWorkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-nested-root-'));
    const batchWorkDir = path.join(batchWorkRoot, 'batch-0');
    const workspacePath = 'deploy/terraform/aws';
    const gitRoot = path.join(batchWorkDir, workspacePath);
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-nested-consumer-'));

    fs.mkdirSync(gitRoot, { recursive: true });
    initRepo(gitRoot, { 'dolphinscheduler-alert.tf': 'v1\n' });
    initRepo(workspaceRoot, {
      'deploy/terraform/aws/dolphinscheduler-alert.tf': 'v1\n',
    });

    fs.writeFileSync(path.join(gitRoot, 'dolphinscheduler-alert.tf'), 'v2\n');
    git(['add', 'dolphinscheduler-alert.tf'], gitRoot);
    git(
      ['commit', '-m', 'fix(gomboc): sentinel-ec2 (dolphinscheduler-alert.tf)'],
      gitRoot
    );

    configureGitIdentity(workspaceRoot);
    const replay = replayRemediationCommits({
      batches: [
        {
          batchId: 'batch-0',
          workspacePath,
          orlLanguage: 'terraform',
          files: ['deploy/terraform/aws/dolphinscheduler-alert.tf'],
        },
      ],
      batchWorkRoot,
      workspaceRoot,
    });

    assert.equal(replay.commitCount, 1);
    assert.deepEqual(replay.allFiles, ['deploy/terraform/aws/dolphinscheduler-alert.tf']);
    assert.equal(
      fs.readFileSync(
        path.join(workspaceRoot, 'deploy/terraform/aws/dolphinscheduler-alert.tf'),
        'utf8'
      ),
      'v2\n'
    );
  });
});
