import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  listCommitsFromBatchGit,
  listCommitsFromManifest,
  replayRemediationCommits,
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
  it('lists hook commits from batch git history', () => {
    const batchWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orl-batch-'));
    initRepo(batchWorkDir, { 'main.tf': 'v1\n' });

    fs.writeFileSync(path.join(batchWorkDir, 'main.tf'), 'v2\n');
    git(['add', 'main.tf'], batchWorkDir);
    git(['commit', '-m', 'fix(gomboc): rule-a (main.tf)'], batchWorkDir);

    fs.writeFileSync(path.join(batchWorkDir, 'other.tf'), 'new\n');
    git(['add', 'other.tf'], batchWorkDir);
    git(['commit', '-m', 'fix(gomboc): rule-b (other.tf)'], batchWorkDir);

    const commits = listCommitsFromBatchGit(batchWorkDir);
    assert.equal(commits.length, 2);
    assert.equal(commits[0].message, 'fix(gomboc): rule-a (main.tf)');
    assert.deepEqual(commits[0].files, ['main.tf']);
    assert.equal(commits[1].message, 'fix(gomboc): rule-b (other.tf)');
    assert.deepEqual(commits[1].files, ['other.tf']);
  });

  it('reads commits from manifest.jsonl fallback', () => {
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
    fs.writeFileSync(path.join(batchWorkDir, 'main.tf'), 'v2\n');
    fs.writeFileSync(path.join(batchWorkDir, 'other.tf'), 'new\n');

    const commits = listCommitsFromManifest(batchWorkDir);
    assert.equal(commits.length, 2);
    assert.equal(commits[0].message, 'fix(gomboc): rule-a (main.tf)');
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
});
