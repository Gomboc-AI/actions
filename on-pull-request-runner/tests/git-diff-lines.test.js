import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitDiffChangedLines, parsePatchCommentableLines, snapToCommentableLine } from '../dist/lib/git-diff-lines.js';
import { configureGitIdentity } from '../dist/lib/git.js';

function git(args, cwd) {
  execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function initRepo(cwd) {
  git(['init'], cwd);
  configureGitIdentity(cwd);
}

describe('git-diff-lines', () => {
  it('collects each added line from multi-line hunks', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'git-diff-lines-'));
    fs.writeFileSync(path.join(cwd, 'main.tf'), 'a\nb\nc\n');
    initRepo(cwd);
    git(['add', 'main.tf'], cwd);
    git(['commit', '-m', 'base'], cwd);

    fs.writeFileSync(path.join(cwd, 'main.tf'), 'a\nb\nc\n  enable_x = true\n  enable_y = true\n');
    git(['add', 'main.tf'], cwd);
    git(['commit', '-m', 'fix'], cwd);

    const baseSha = execFileSync('git', ['rev-parse', 'HEAD~1'], { cwd, encoding: 'utf8' }).trim();
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();

    const lines = gitDiffChangedLines({
      baseSha,
      headSha,
      cwd,
      filePath: 'main.tf',
    });

    assert.ok(lines.includes(4));
    assert.ok(lines.includes(5));
  });

  it('collects lines from multiple hunks in one file', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'git-diff-lines-multi-'));
    fs.writeFileSync(
      path.join(cwd, 'main.tf'),
      'resource "a" {}\n\nresource "b" {}\n\nresource "c" {}\n'
    );
    initRepo(cwd);
    git(['add', 'main.tf'], cwd);
    git(['commit', '-m', 'base'], cwd);

    fs.writeFileSync(
      path.join(cwd, 'main.tf'),
      'resource "a" { x = 1 }\n\nresource "b" { y = 2 }\n\nresource "c" { z = 3 }\n'
    );
    git(['add', 'main.tf'], cwd);
    git(['commit', '-m', 'fix'], cwd);

    const baseSha = execFileSync('git', ['rev-parse', 'HEAD~1'], { cwd, encoding: 'utf8' }).trim();
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();

    const lines = gitDiffChangedLines({
      baseSha,
      headSha,
      cwd,
      filePath: 'main.tf',
    });

    assert.ok(lines.includes(1));
    assert.ok(lines.includes(3));
    assert.ok(lines.includes(5));
  });

  it('parses commentable lines from a unified patch', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' resource "a" {',
      '-  old = true',
      '+  new = true',
      '+  added = 1',
      ' }',
    ].join('\n');

    assert.deepEqual(parsePatchCommentableLines(patch), [1, 2, 3, 4]);
  });

  it('snaps preferred anchors to the nearest commentable diff line', () => {
    assert.equal(snapToCommentableLine(10, [40, 55, 70]), 40);
    assert.equal(snapToCommentableLine(72, [40, 55, 70]), 70);
    assert.equal(snapToCommentableLine(55, [40, 55, 70]), 55);
  });
});
