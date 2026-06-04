import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { configureGitIdentity } from '../dist/lib/git.js';

describe('git identity', () => {
  it('sets local user.name and user.email for commits', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'git-id-'));
    execFileSync('git', ['init'], { cwd });

    const prevName = process.env.GIT_COMMIT_USER_NAME;
    const prevEmail = process.env.GIT_COMMIT_USER_EMAIL;
    const prevActor = process.env.GITHUB_ACTOR;
    delete process.env.GIT_COMMIT_USER_NAME;
    delete process.env.GIT_COMMIT_USER_EMAIL;
    delete process.env.GITHUB_ACTOR;

    try {
      configureGitIdentity(cwd);
      const name = execFileSync('git', ['config', 'user.name'], {
        cwd,
        encoding: 'utf8',
      }).trim();
      const email = execFileSync('git', ['config', 'user.email'], {
        cwd,
        encoding: 'utf8',
      }).trim();
      assert.equal(name, 'github-actions[bot]');
      assert.equal(email, '41898282+github-actions[bot]@users.noreply.github.com');
    } finally {
      if (prevName === undefined) delete process.env.GIT_COMMIT_USER_NAME;
      else process.env.GIT_COMMIT_USER_NAME = prevName;
      if (prevEmail === undefined) delete process.env.GIT_COMMIT_USER_EMAIL;
      else process.env.GIT_COMMIT_USER_EMAIL = prevEmail;
      if (prevActor === undefined) delete process.env.GITHUB_ACTOR;
      else process.env.GITHUB_ACTOR = prevActor;
    }
  });
});
