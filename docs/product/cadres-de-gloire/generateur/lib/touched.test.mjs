// Témoins du choix des collections que la garde re-mesure sur une PR (#10277, prompt § 7 L2) : seules celles que le
// diff touche, toutes dès qu'un fichier commun (lib/, mee/, fonts/) bouge ou que le diff est illisible.
// Usage : node --test lib/touched.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { touchedCollections, touchedOutput } from './touched.mjs';

const COLLECTIONS = ['abysses', 'neon', 'savane', 'succes'];
const D = 'docs/product/cadres-de-gloire';

test('un atelier, un manifeste, un relevé ou un contrat désignent leur collection', () => {
  assert.deepEqual(touchedCollections([`${D}/generateur/ateliers/neon/gen.py`, `${D}/manifests/savane.json`], COLLECTIONS), ['neon', 'savane']);
  assert.deepEqual(touchedCollections([`${D}/controle/mises-en-page-abysses.json`, 'packages/shared/design/glory-frames/succes.json'], COLLECTIONS), ['abysses', 'succes']);
});

test('un fichier commun du générateur fait tout re-mesurer', () => {
  assert.equal(touchedCollections([`${D}/generateur/lib/base.py`], COLLECTIONS), 'all');
  assert.equal(touchedCollections([`${D}/generateur/lib/anchors.json`], COLLECTIONS), 'all');
  assert.equal(touchedCollections([`${D}/generateur/mee/mee-fete.png`], COLLECTIONS), 'all');
  assert.equal(touchedCollections([`${D}/generateur/fixture/photo.jpg`], COLLECTIONS), 'all');
});

test('un fichier GLOBAL de la CI fait tout re-mesurer : l’épingle de Playwright (donc Chromium) vit dans ci.yml', () => {
  assert.equal(touchedCollections(['.github/workflows/ci.yml'], COLLECTIONS), 'all');
  assert.equal(touchedCollections(['bun.lock'], COLLECTIONS), 'all');
  assert.equal(touchedCollections(['.github/actions/preparer-js/action.yml', `${D}/manifests/neon.json`], COLLECTIONS), 'all');
});

test('un diff illisible fait tout re-mesurer ; un diff hors du domaine ne re-mesure rien', () => {
  assert.equal(touchedCollections(null, COLLECTIONS), 'all');
  assert.deepEqual(touchedCollections(['apps/web/src/main.tsx', `${D}/README.md`], COLLECTIONS), []);
});

test('la sortie dit « none » quand rien n’est touché : une sortie vide est un plantage, jamais une sélection', () => {
  assert.equal(touchedOutput('all'), 'all');
  assert.equal(touchedOutput([]), 'none');
  assert.equal(touchedOutput(['neon', 'savane']), 'neon,savane');
});
