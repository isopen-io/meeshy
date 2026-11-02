// Témoins du TRI des textes de décor côté générateur (#10256) : la table de packages/shared range chaque `decor.<n>`
// d'un export en neutre (cuit dans la couche decor), traduit ou vivant ; un texte qu'elle ne range pas fait rougir
// export-check, comme un texte neutre resté emplacement ou cuit dans la fenêtre photo.
// Usage : node --test lib/decor-sorts.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DECOR_TEXTS_FILE, bakedSlotsOf, decorTextFailures, frameIdOf, readDecorTexts } from './decor-sorts.mjs';

const TABLE = {
  'celeste.mythe-b': {
    'decor.1': { sample: 'CELLULE', sort: 'translated', key: 'game.frame.decor.cell' },
    'decor.2': { sample: '10−5 m', sort: 'baked' },
  },
};

const exported = (over = {}) => ({ frame: 'celeste-mythe-b', text: { title: { text: 'Mythe' }, 'decor.1': { text: 'CELLULE' } }, baked: [{ slot: 'decor.2', sample: '10−5 m' }], bakedInWindow: 0, ...over });

test('l’identifiant du contrat se lit depuis le nom exporté', () => {
  assert.equal(frameIdOf('celeste', 'celeste-mythe-b'), 'celeste.mythe-b');
  assert.equal(frameIdOf('tresor', 'tresor-reserve-a'), 'tresor.reserve-a');
});

test('seuls les textes déclarés neutres, au même échantillon, se cuisent', () => {
  const dom = new Map([['decor.1', 'CELLULE'], ['decor.2', '10−5 m'], ['decor.3', 'ATOME']]);
  assert.deepEqual(bakedSlotsOf(TABLE, 'celeste.mythe-b', dom), ['decor.2']);
  assert.deepEqual(bakedSlotsOf(TABLE, 'celeste.mythe-b', new Map([['decor.2', '10−9 m']])), []);
  assert.deepEqual(bakedSlotsOf(TABLE, 'nord.mythe-c', dom), []);
});

test('un export trié, son neutre cuit hors de la fenêtre, passe', () => {
  assert.deepEqual(decorTextFailures(exported(), 'celeste', TABLE), []);
});

test('un texte de décor que la table ne range pas rougit, nommé', () => {
  const frame = exported({ text: { 'decor.1': { text: 'CELLULE' }, 'decor.4': { text: 'ON AIR' } } });
  assert.deepEqual(decorTextFailures(frame, 'celeste', TABLE), ['celeste.mythe-b#decor.4 : texte de décor ni traduit ni déclaré neutre (« ON AIR »)']);
});

test('un emplacement renuméroté rougit : la table range un autre texte', () => {
  const frame = exported({ text: { 'decor.1': { text: 'ATOME' } } });
  assert.deepEqual(decorTextFailures(frame, 'celeste', TABLE), ['celeste.mythe-b#decor.1 : la table range « CELLULE », l’export porte « ATOME »']);
});

test('un texte neutre resté emplacement, ou cuit sans être déclaré neutre, rougit', () => {
  const live = exported({ text: { 'decor.1': { text: 'CELLULE' }, 'decor.2': { text: '10−5 m' } }, baked: [] });
  assert.deepEqual(decorTextFailures(live, 'celeste', TABLE), ['celeste.mythe-b#decor.2 : texte neutre resté emplacement (« 10−5 m ») : il se cuit dans le décor']);
  const wrong = exported({ text: {}, baked: [{ slot: 'decor.1', sample: 'CELLULE' }] });
  assert.deepEqual(decorTextFailures(wrong, 'celeste', TABLE), ['celeste.mythe-b#decor.1 : texte cuit sans être déclaré neutre (« CELLULE »)']);
});

test('un texte cuit dans la fenêtre photo rougit : la photo le couvrirait', () => {
  assert.deepEqual(decorTextFailures(exported({ bakedInWindow: 12 }), 'celeste', TABLE), ['celeste-mythe-b : texte cuit dans la fenêtre photo (12 px)']);
});

test('la table versionnée se lit, et une table illisible arrête tout', () => {
  assert.ok(Object.keys(readDecorTexts(DECOR_TEXTS_FILE)).length > 0);
  const broken = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'decor-')), 'decor-texts.json');
  fs.writeFileSync(broken, JSON.stringify({ frames: { 'celeste.mythe-b': { 'decor.1': { sample: 'X', sort: 'maybe' } } } }));
  assert.throws(() => readDecorTexts(broken), /tri inconnu/);
});
