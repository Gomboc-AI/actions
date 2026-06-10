/**
 * Composite step: `orl rules pull` into `ORL_RULES_DIR` via Docker.
 */
import fs from 'node:fs';
import { artifactPath, getArtifactsRoot } from './lib/artifacts.js';
import { currentUidGid, dockerRunOrThrow } from './lib/docker.js';
import { requireEnv } from './lib/env.js';
import { runMain } from './lib/runner.js';

async function main(): Promise<void> {
  const rulesDir = process.env.ORL_RULES_DIR ?? artifactPath('orl-rules');
  fs.mkdirSync(rulesDir, { recursive: true });

  const image = requireEnv('ORL_IMAGE');
  const token = requireEnv('GOMBOC_ACCESS_TOKEN');
  const rulesUrl = requireEnv('RULES_SERVICE_URL');
  const channel = requireEnv('ORL_CHANNEL');
  const { uid, gid } = currentUidGid();

  await dockerRunOrThrow({
    argv: [
      'run',
      '--rm',
      '--user',
      `${uid}:${gid}`,
      '-v',
      `${rulesDir}:/output`,
      '-e',
      `RULE_SERVICE_TOKEN=${token}`,
      image,
      'rules',
      'pull',
      `--url=${rulesUrl}`,
      '--out=/output',
      `--channel=${channel}`,
    ],
  });

  console.log(`Rules pulled to ${rulesDir}`);
  fs.mkdirSync(getArtifactsRoot(), { recursive: true });
  fs.writeFileSync(artifactPath('rules-dir.txt'), rulesDir, 'utf8');
}

runMain(main);
