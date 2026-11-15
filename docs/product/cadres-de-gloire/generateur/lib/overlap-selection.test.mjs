// Témoins de la SÉLECTION de la garde d'empiètement (#10277) : depuis que la CI passe `--only` calculé
// (lib/touched.mjs), une sélection vide ou un nom qui ne désigne rien fait rougir la garde, jamais la valide.
// Usage : node --test lib/overlap-selection.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { selectFrames } from './overlap-rule.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FRAMES = new Map([
  ['neon', ['neon-ambassadeur-1', 'neon-ambassadeur-2']],
  ['savane', ['savane-orateur-a']],
]);

test('sans --only, chaque cadre de chaque collection', () => {
  assert.deepEqual(selectFrames(FRAMES, null), {
    jobs: [{ collection: 'neon', name: 'neon-ambassadeur-1' }, { collection: 'neon', name: 'neon-ambassadeur-2' }, { collection: 'savane', name: 'savane-orateur-a' }],
    failures: [],
  });
});

test('--only désigne une collection entière ou un cadre', () => {
  assert.deepEqual(selectFrames(FRAMES, ['savane', 'neon-ambassadeur-2']).jobs.map((job) => job.name), ['neon-ambassadeur-2', 'savane-orateur-a']);
  assert.deepEqual(selectFrames(FRAMES, ['savane', 'neon-ambassadeur-2']).failures, []);
});

test('un nom qui ne désigne rien rougit, même à côté d’un nom juste', () => {
  assert.match(selectFrames(FRAMES, ['savane', 'nosuchframe']).failures.join(' '), /nosuchframe/);
});

test('une sélection vide rougit : aucun cadre mesuré n’est une garde verte', () => {
  assert.equal(selectFrames(FRAMES, ['nosuchframe']).jobs.length, 0);
  assert.notDeepEqual(selectFrames(FRAMES, ['nosuchframe']).failures, []);
  assert.notDeepEqual(selectFrames(new Map(), null).failures, []);
  assert.notDeepEqual(selectFrames(FRAMES, []).failures, []);
});

test('la garde sort en 1 sur une sélection vide, avant d’ouvrir le navigateur', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'overlap-selection-'));
  fs.mkdirSync(path.join(out, 'neon'));
  fs.writeFileSync(path.join(out, 'neon', 'manifest.json'), '[]\n');
  fs.writeFileSync(path.join(out, 'neon', 'neon-ambassadeur-1.svg'), '<svg/>\n');
  const run = spawnSync(process.execPath, [path.join(HERE, 'overlap.mjs'), '--check', '--out', out, '--controle', out, '--only', 'nosuchframe'], { encoding: 'utf8' });
  fs.rmSync(out, { recursive: true, force: true });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /ROUGE/);
  assert.match(run.stderr, /nosuchframe/);
});
