// Le chemin de chaque fenêtre VERSIONNÉE (#10254) rend son masque au pixel près : chaque cadre des contrats de
// packages/shared/design/glory-frames/ porte `window.path`, dans la grammaire fermée, et ce chemin rastérisé (règle
// non nulle, centre des pixels) égale le masque sans perte servi par le magasin (services/gateway/assets/packs/).
// C'est ce qui permet au peintre de découper au chemin sans décoder d'image : un écart d'un seul pixel rougit.
// Usage : SHARP_MODULE=sharp node --test lib/window-path-contracts.test.mjs (sharp : lib/sharp.mjs)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import sharp from './sharp.mjs';
import { WINDOW_PATH_PATTERN, rasterizeWindowPath } from './window-path.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../../../..');
const CONTRACTS = path.join(ROOT, 'packages/shared/design/glory-frames');
const STORE = path.join(ROOT, 'services/gateway/assets/packs');

const collections = fs
  .readdirSync(CONTRACTS)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(fs.readFileSync(path.join(CONTRACTS, file), 'utf8')))
  .filter((document) => Array.isArray(document.frames) && typeof document.collection === 'string');

const formatsOf = (frame) => Object.entries(frame.formats).filter(([, format]) => format !== null).map(([name, format]) => ({ id: `${frame.id}:${name}`, window: format.window }));

async function strayed(window) {
  const { data, info } = await sharp(path.join(STORE, window.mask.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raster = rasterizeWindowPath(window.path, { origin: [window.mask.box[0], window.mask.box[1]], width: info.width, height: info.height });
  let count = 0;
  for (let i = 0; i < info.width * info.height; i++) if (raster[i] !== (data[i * 4 + 3] >= 128 ? 1 : 0)) count++;
  return count;
}

test('les contrats versionnés sont lus (sinon ce témoin ne prouverait rien)', () => {
  assert.ok(collections.length >= 10, `${collections.length} collection(s)`);
  assert.ok(collections.flatMap((document) => document.frames).length >= 180);
});

test('chaque fenêtre versionnée porte son chemin, dans la grammaire fermée', () => {
  const missing = collections.flatMap((document) => document.frames.flatMap(formatsOf)).filter(({ window }) => typeof window.path !== 'string' || !WINDOW_PATH_PATTERN.test(window.path));
  assert.deepEqual(missing.map(({ id }) => id), []);
});

test('chaque chemin rend son masque au pixel près', async () => {
  const formats = collections.flatMap((document) => document.frames.flatMap(formatsOf)).filter(({ window }) => typeof window.path === 'string');
  const drift = [];
  for (const { id, window } of formats) {
    const count = await strayed(window);
    if (count > 0) drift.push(`${id} : ${count} px`);
  }
  assert.deepEqual(drift, []);
});
