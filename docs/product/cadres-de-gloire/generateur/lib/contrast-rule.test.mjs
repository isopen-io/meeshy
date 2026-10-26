// Témoins de la règle de lisibilité des textes d'un cadre (#10265, § 5.2 et § 7 L3 du prompt) : chaque emplacement
// tient son contraste minimal contre ce qui est dessous (4,5:1, 3:1 au-dessus de 24 px), ou déclare un effet — ombre,
// lueur, contour — qui, MESURÉ sur le rendu, le rend lisible. Un effet déclaré qui ne sépare pas le texte de son fond
// (une lueur de la couleur du texte) ne sauve rien. Images synthétiques, aucun navigateur.
// Usage : node --test lib/contrast-rule.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrastRatio, declaresEffect, edgeContrastOf, judgeContrast, minContrastFor, slotsOf, underGlyphContrastOf, verdictOf } from './contrast-rule.mjs';

const SIZE = 64;
const MASK = [20, 20, 200];
const GLYPH = [24, 24, 16, 16];

const image = (paint) => {
  const data = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a = 255] = paint(x, y);
    data.set([r, g, b, a], (y * SIZE + x) * 4);
  }
  return { data, width: SIZE, height: SIZE };
};
const inGlyph = (x, y) => x >= GLYPH[0] && x < GLYPH[0] + GLYPH[2] && y >= GLYPH[1] && y < GLYPH[1] + GLYPH[3];
const ring = (x, y, width) => !inGlyph(x, y) && x >= GLYPH[0] - width && x < GLYPH[0] + GLYPH[2] + width && y >= GLYPH[1] - width && y < GLYPH[1] + GLYPH[3] + width;

const mask = image((x, y) => (inGlyph(x, y) ? MASK : [0, 0, 0, 0]));
const slot = ({ fill = '#DDDDDD', opacity = 1, size = 20, effects = [], stroke = null } = {}) => ({
  fill: { solid: fill }, opacity, font: { size }, bbox: GLYPH, effects, stroke,
});
const LIGHT = [204, 204, 204];
const plain = image(() => LIGHT);
const fills = image((x, y) => (inGlyph(x, y) ? [221, 221, 221] : [0, 0, 0, 0]));

test('le seuil suit la taille : 4,5:1, et 3:1 au-dessus de 24 px', () => {
  assert.equal(minContrastFor(24), 4.5);
  assert.equal(minContrastFor(24.5), 3);
  assert.equal(minContrastFor(80), 3);
});

test('le rapport de contraste est celui des jetons (WCAG), blanc sur noir = 21', () => {
  assert.equal(Math.round(contrastRatio([255, 255, 255], [0, 0, 0]) * 100) / 100, 21);
  assert.equal(contrastRatio([128, 128, 128], [128, 128, 128]), 1);
});

test('un texte clair sur un fond clair est mesuré sous le seuil, contre ce qui est dessous', () => {
  const measured = underGlyphContrastOf({ mask, color: MASK, under: plain, slot: slot() });
  assert.ok(measured.contrast < 1.3, `contraste ${measured.contrast}`);
  assert.equal(measured.glyphPixels, GLYPH[2] * GLYPH[3]);
});

test('sans pixel de glyphe, rien n’est mesuré', () => {
  assert.equal(underGlyphContrastOf({ mask: image(() => [0, 0, 0, 0]), color: MASK, under: plain, slot: slot() }), null);
  assert.equal(edgeContrastOf({ mask: image(() => [0, 0, 0, 0]), color: MASK, fills, around: plain, slot: slot() }), null);
});

test('un contour sombre se mesure au bord du glyphe : il sépare le texte clair de son fond clair', () => {
  const outlined = image((x, y) => (inGlyph(x, y) ? [221, 221, 221] : ring(x, y, 4) ? [10, 10, 10] : LIGHT));
  assert.ok(edgeContrastOf({ mask, color: MASK, fills, around: outlined, slot: slot() }).contrast > 10);
});

test('une lueur de la couleur du texte ne le sépare pas de son fond', () => {
  const glowing = image((x, y) => (inGlyph(x, y) ? [221, 221, 221] : ring(x, y, 4) ? [230, 230, 230] : LIGHT));
  assert.ok(edgeContrastOf({ mask, color: MASK, fills, around: glowing, slot: slot() }).contrast < 1.3);
});

test('l’opacité du texte se compose sur ce qui l’entoure', () => {
  const outlined = image((x, y) => (inGlyph(x, y) ? [221, 221, 221] : ring(x, y, 4) ? [10, 10, 10] : LIGHT));
  const opaque = edgeContrastOf({ mask, color: MASK, fills, around: outlined, slot: slot() }).contrast;
  const faint = edgeContrastOf({ mask, color: MASK, fills, around: outlined, slot: slot({ opacity: 0.1 }) }).contrast;
  assert.ok(faint < 1.5 && faint < opaque, `${faint} < ${opaque}`);
});

test('un effet est déclaré par une copie posée sous le texte ou par un contour', () => {
  assert.equal(declaresEffect(slot()), false);
  assert.equal(declaresEffect(slot({ stroke: { paint: { solid: '#000000FF' }, width: 2 } })), true);
  assert.equal(declaresEffect(slot({ effects: [{ dx: 0, dy: 2, fill: { solid: '#00000099' }, opacity: 1, under: true }] })), true);
});

test('le verdict : tenu, sauvé par son effet mesuré, ou bas', () => {
  assert.equal(verdictOf({ size: 20, contrast: 4.6, withEffect: null, effect: false }), 'tenu');
  assert.equal(verdictOf({ size: 30, contrast: 3.1, withEffect: null, effect: false }), 'tenu');
  assert.equal(verdictOf({ size: 20, contrast: 2, withEffect: 6, effect: true }), 'effet');
  assert.equal(verdictOf({ size: 20, contrast: 2, withEffect: 6, effect: false }), 'bas');
  assert.equal(verdictOf({ size: 20, contrast: 2, withEffect: 4, effect: true }), 'bas');
  assert.equal(verdictOf({ size: 20, contrast: null, withEffect: null, effect: false }), 'bas');
});

test('le jugement : un texte bas hors du cliquet rougit, un texte du cliquet devenu lisible se signale', () => {
  const rows = [
    { id: 'neon.orateur-c#title', verdict: 'effet' },
    { id: 'neon.orateur-c#date', verdict: 'bas' },
    { id: 'neon.orateur-c#kicker', verdict: 'tenu' },
    { id: 'olympe.legende-3#date', verdict: 'bas' },
  ];
  const judged = judgeContrast(rows, ['neon.orateur-c#title', 'olympe.legende-3#date', 'tresor.coffre-b#decor.12']);
  assert.deepEqual(judged.fresh.map((row) => row.id), ['neon.orateur-c#date']);
  assert.deepEqual(judged.tolerated.map((row) => row.id), ['olympe.legende-3#date']);
  assert.deepEqual(judged.solved, ['neon.orateur-c#title', 'tresor.coffre-b#decor.12']);
});

test('les emplacements se groupent comme l’export : le principal est le dernier texte plein, les autres sont ses effets', () => {
  const text = (index, over) => ({ index, slot: 'title', x: 10, baseline: 20, matrix: [1, 0, 0, 1, 0, 0], fill: null, stroke: null, opacity: 1, filter: null, ...over });
  const [title] = slotsOf([text(0, { filter: [[{ op: 'feGaussianBlur' }]], opacity: 0.7 }), text(1, { matrix: [1, 0, 0, 1, 0, 2] }), text(2, {})]);
  assert.equal(title.main.index, 2);
  assert.deepEqual(title.effects.map((effect) => [effect.dy, effect.under]), [[0, true], [2, true]]);
});
