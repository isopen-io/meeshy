// Témoins des deux étapes de ci.yml qui choisissent puis re-mesurent les collections touchées (#10277) : rejouées
// telles que la CI les écrit, sous `bash -e` comme GitHub Actions, avec un `node` qui plante ou qui compte ses appels.
// Un plantage du choix rougit l'étape ; une sélection vide fait rougir la garde, jamais passer au vert sans mesurer.
// Usage : node --test lib/touched-ci.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CI = fs.readFileSync(path.join(HERE, '../../../../../.github/workflows/ci.yml'), 'utf8').split('\n');

function stepScript(name) {
  const at = CI.findIndex((line) => line.trim() === `- name: ${name}`);
  assert.ok(at >= 0, `étape « ${name} » absente de ci.yml`);
  const run = CI.findIndex((line, i) => i > at && line.trim() === 'run: |');
  const indent = CI[run].search(/\S/);
  const body = [];
  for (const line of CI.slice(run + 1)) {
    if (line.trim() !== '' && line.search(/\S/) <= indent) break;
    body.push(line);
  }
  const strip = Math.min(...body.filter((line) => line.trim() !== '').map((line) => line.search(/\S/)));
  return body.map((line) => line.slice(strip)).join('\n').replaceAll('${{ github.event_name }}', 'pull_request');
}

function runStep(name, { nodeExit, env = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'touched-ci-'));
  const calls = path.join(dir, 'calls');
  const output = path.join(dir, 'output');
  fs.writeFileSync(path.join(dir, 'node'), `#!/bin/sh\necho "$@" >> "${calls}"\nexit ${nodeExit}\n`, { mode: 0o755 });
  fs.writeFileSync(output, '');
  const run = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', stepScript(name)], {
    encoding: 'utf8',
    env: { PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: output, BASE: 'origin/dev', ...env },
  });
  const result = { status: run.status, output: fs.readFileSync(output, 'utf8'), calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '' };
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('un choix des collections qui plante rougit l’étape, sans écrire de sélection vide', () => {
  const run = runStep('Collections touchées', { nodeExit: 3 });
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(run.output, /^only=$/m);
});

test('une sélection vide fait rougir la garde d’empiètement', () => {
  const run = runStep("Garde d'empiètement, chaque mise en page déclarée", { nodeExit: 0, env: { ONLY: '' } });
  assert.notEqual(run.status, 0);
  assert.equal(run.calls, '');
});

test('« none » ne re-mesure rien et passe ; une liste re-mesure ses seules collections', () => {
  assert.deepEqual(runStep("Garde d'empiètement, chaque mise en page déclarée", { nodeExit: 0, env: { ONLY: 'none' } }), { status: 0, output: '', calls: '' });
  const listed = runStep("Garde d'empiètement, chaque mise en page déclarée", { nodeExit: 0, env: { ONLY: 'neon,savane' } });
  assert.equal(listed.status, 0);
  assert.match(listed.calls, /--only neon,savane/);
});
