// Test du générateur : `bun test apps/android/scripts/gen-mee-catalog.test.mjs` (ou `node --test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '../core/model/src/main/kotlin/me/meeshy/sdk/model/sticker');
const files = ['MeeStickerCatalogData.kt', 'MeeInstantCatalogData.kt'].map((name) => join(data, name));
const run = (...args) => spawnSync('bun', [join(here, 'gen-mee-catalog.mjs'), ...args], { encoding: 'utf8' });
const read = () => files.map((file) => readFileSync(file, 'utf8'));

test('la deuxième exécution produit une sortie identique', () => {
  assert.equal(run().status, 0);
  const first = read();
  assert.equal(run().status, 0);
  assert.deepEqual(read(), first);
});

test('--check passe quand tout est régénéré, y compris le bandeau GÉNÉRÉ', () => {
  assert.equal(run('--check').status, 0);
  read().forEach((text) => assert.match(text, /^\/\/ GÉNÉRÉ par apps\/android\/scripts\/gen-mee-catalog\.mjs/));
});

test('--check détecte un écart et ne réécrit rien', () => {
  const original = read();
  writeFileSync(files[0], original[0].replace('"Coucou"', '"Coucou modifié"'));
  try {
    const result = run('--check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MeeStickerCatalogData\.kt/);
    assert.notEqual(readFileSync(files[0], 'utf8'), original[0]);
  } finally {
    writeFileSync(files[0], original[0]);
  }
});
