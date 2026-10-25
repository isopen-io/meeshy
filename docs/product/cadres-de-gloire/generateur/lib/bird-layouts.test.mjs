// Témoins des MISES EN PAGE de Mee et Meo (#10277, prompt § 5.7), sans navigateur : quelles mises en page un cadre
// essaie, où les oiseaux partent, comment ils s'écartent de la photo, et laquelle sert par défaut (jamais selfie).
// Usage : node --test lib/bird-layouts.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIRD_LAYOUTS,
  artRect,
  frameRecord,
  recordFailures,
  defaultLayoutOf,
  drawnLayoutOf,
  exportedBirds,
  layoutsToTry,
  nominalAnchors,
  placeBody,
  posesFor,
  scoreBody,
} from './bird-layouts.mjs';

const W = 40;
const H = 40;

// Une scène de 40×40 : la fenêtre occupe les colonnes 10 à 29, toutes les lignes.
const scene = ({ clear = [] } = {}) => {
  const win = new Uint8Array(W * H);
  const dist = new Int32Array(W * H);
  const covered = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inside = x >= 10 && x < 30;
      win[y * W + x] = inside ? 1 : 0;
      dist[y * W + x] = inside ? Math.min(x - 9, 30 - x) : 0;
    }
  }
  for (const [x0, y0, x1, y1] of clear) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) covered[y * W + x] = 1;
  return { win, dist, clear: covered, width: W, height: H, margin: 0, faces: [] };
};

// Un corps carré de 4×4 autour de son centre.
const square = Int32Array.from([-2, -1, 0, 1].flatMap((y) => [-2, -1, 0, 1].flatMap((x) => [x, y])));

test('la mise en page dessinée se lit dans la prose du manifeste, comme le contrat partagé la lit', () => {
  assert.equal(drawnLayoutOf('pied : Mee (sourire) et Meo (cool) au bas de l’enseigne', 2), 'pied');
  assert.equal(drawnLayoutOf('perchés (Mee coucou, Meo salut)', 2), 'perches');
  assert.equal(drawnLayoutOf('Côtés : qui se penchent', 2), 'cotes');
  assert.equal(drawnLayoutOf('selfie : Meo tient l’appareil', 1), 'selfie');
  assert.equal(drawnLayoutOf('ensemble au bas du cadre', 1), 'duo');
  assert.equal(drawnLayoutOf('sur la balance des deux plateaux', 2), 'libre');
});

test('un cadre essaie les mises en page qu’il ne dessine pas, sauf quand son décor tient aux oiseaux', () => {
  assert.deepEqual(layoutsToTry({ drawn: 'pied', tied: false }), ['perches', 'cotes', 'duo', 'selfie']);
  assert.deepEqual(layoutsToTry({ drawn: 'selfie', tied: false }), ['pied', 'perches', 'cotes', 'duo']);
  assert.deepEqual(layoutsToTry({ drawn: 'pied', tied: true }), []);
  assert.deepEqual(layoutsToTry({ drawn: 'ruban', tied: false }), []);
  assert.ok(!layoutsToTry({ drawn: 'libre', tied: false }).includes('ruban'), 'le ruban n’existe que sur un cadre dont le support est un ruban');
});

test('les oiseaux d’une mise en page générée gardent les poses du cadre, jamais une pose de selfie hors du selfie', () => {
  assert.deepEqual(posesFor([{ pose: 'mee-fete' }, { pose: 'meo-champagne' }]), { mee: 'mee-fete', meo: 'meo-champagne', pair: 'duo-coucou' });
  assert.deepEqual(posesFor([{ pose: 'meo-selfie' }]), { mee: 'mee-coucou', meo: 'meo-salut', pair: 'duo-coucou' });
  assert.deepEqual(posesFor([{ pose: 'duo-bravo' }]), { mee: 'mee-coucou', meo: 'meo-salut', pair: 'duo-bravo' });
  assert.deepEqual(posesFor([{ pose: 'duo-mee-selfie' }]), { mee: 'mee-coucou', meo: 'meo-salut', pair: 'duo-coucou' });
});

test('chaque mise en page générée part de sa place canonique, en pixels de l’image finale', () => {
  const poses = { mee: 'mee-fete', meo: 'meo-roi', pair: 'duo-coucou' };
  const pied = nominalAnchors('pied', poses);
  assert.deepEqual(pied.map((a) => a.pose), ['mee-fete', 'meo-roi']);
  assert.deepEqual(pied[0].center, [196, 1400]);
  assert.equal(pied[0].size, 300);
  assert.equal(pied[1].flip, true);
  assert.deepEqual(nominalAnchors('selfie', poses).map((a) => a.pose), ['meo-selfie']);
  assert.deepEqual(nominalAnchors('duo', poses).map((a) => a.pose), ['duo-coucou']);
  assert.throws(() => nominalAnchors('ruban', poses));
});

test('le dessin d’une pose occupe, dans la boîte carrée de son ancre, le rectangle de son image ajustée', () => {
  assert.deepEqual(artRect([300, 150]), [0, 0.25, 1, 0.5]);
  assert.deepEqual(artRect([240, 300]), [0.1, 0, 0.8, 1]);
  assert.deepEqual(artRect([200, 200]), [0, 0, 1, 1]);
});

test('le score compte l’empiètement, la profondeur, ce qui sort de la carte et ce qui couvre un texte', () => {
  const ctx = scene({ clear: [[0, 0, 4, 4]] });
  assert.deepEqual(scoreBody(square, [5, 20], { dx: 0, dy: 0, scale: 1 }, ctx), { overlap: 0, depth: 0, outside: 0, covered: 0, face: 0 });
  assert.equal(scoreBody(square, [20, 20], { dx: 0, dy: 0, scale: 1 }, ctx).overlap, 16);
  assert.equal(scoreBody(square, [1, 20], { dx: 0, dy: 0, scale: 1 }, ctx).outside, 4);
  assert.equal(scoreBody(square, [4, 4], { dx: 0, dy: 0, scale: 1 }, ctx).covered, 4);
});

test('un oiseau posé dans la photo s’écarte vers l’extérieur, du moins possible', () => {
  const ctx = scene();
  const found = placeBody(square, [12, 20], ctx, { target: { overlap: 0, depth: 0 }, step: 1, maxShift: 12, scales: [1] });
  assert.ok(found !== null);
  assert.equal(scoreBody(square, [12, 20], found, ctx).overlap, 0);
  assert.equal(found.dx, -4);
  assert.equal(found.dy, 0);
});

test('un oiseau qui ne trouve aucune place hors de la photo ne déclare pas sa mise en page', () => {
  const ctx = scene({ clear: [[0, 0, 10, 40], [30, 0, 40, 40]] });
  assert.equal(placeBody(square, [20, 20], ctx, { target: { overlap: 0, depth: 0 }, step: 1, maxShift: 30, scales: [1] }), null);
});

test('le selfie se pose DANS la photo, jamais sur un visage', () => {
  const ctx = { ...scene(), faces: [[20, 20, 3]] };
  assert.ok(scoreBody(square, [20, 20], { dx: 0, dy: 0, scale: 1 }, ctx).face > 0);
  const found = placeBody(square, [20, 20], ctx, { selfie: true, step: 1, maxShift: 12, scales: [1] });
  assert.ok(found !== null);
  const at = [20 + found.dx, 20 + found.dy];
  assert.ok(at[0] >= 10 && at[0] < 30, 'Meo reste dans la fenêtre');
  assert.ok((at[0] - 20) ** 2 + (at[1] - 20) ** 2 > 9, 'hors du visage');
});

test('la mise en page par défaut est la dessinée, sauf le selfie : alors la première déclarée, dans l’ordre du contrat', () => {
  assert.equal(defaultLayoutOf('pied', ['pied', 'cotes']), 'pied');
  assert.equal(defaultLayoutOf('selfie', ['selfie', 'cotes', 'perches']), 'perches');
  assert.equal(defaultLayoutOf('selfie', ['selfie']), null);
  assert.deepEqual(BIRD_LAYOUTS, ['pied', 'perches', 'cotes', 'ruban', 'duo', 'libre', 'selfie']);
});

const anchor = (pose, x, over = {}) => ({ pose, box: [x, 1300, 260, 260], rotate: 0, flip: false, opacity: 1, art: [0, 0.05, 1, 0.9], ...over });
const ok = { overlap: 12, depth: 1, face: 0 };

test('un cadre déclare la mise en page dessinée et chaque mise en page générée que le détecteur valide, dans l’ordre du contrat', () => {
  const record = frameRecord({
    frame: 'savane-orateur-a',
    drawn: 'selfie',
    measured: [
      { layout: 'selfie', birds: [anchor('meo-selfie', 600)], validated: { overlap: 9000, depth: 80, face: 0 } },
      { layout: 'duo', birds: [anchor('duo-coucou', 400)], validated: { overlap: 900, depth: 20, face: 0 } },
      { layout: 'cotes', birds: [anchor('mee-fete', 0), anchor('meo-roi', 800)], validated: ok },
      { layout: 'pied', birds: [anchor('mee-fete', 0), anchor('meo-roi', 800)], validated: ok },
    ],
    unplaced: ['perches'],
  });
  assert.deepEqual(Object.keys(record.layouts), ['pied', 'cotes', 'selfie']);
  assert.equal(record.default, 'pied');
  assert.equal(record.drawn, 'selfie');
  assert.deepEqual(record.rejected, { duo: 'hors-regle', perches: 'sans-place' });
  assert.deepEqual(record.layouts.pied.validated, ok);
});

test('la garde rougit sur une mise en page déclarée hors règle, une ancre dessinée périmée ou un défaut selfie', () => {
  const record = frameRecord({ frame: 'neon-oracle-a', drawn: 'pied', measured: [{ layout: 'pied', birds: [anchor('mee-fete', 0), anchor('meo-roi', 800)], validated: ok }, { layout: 'cotes', birds: [anchor('mee-fete', 10), anchor('meo-roi', 790)], validated: ok }], unplaced: [] });
  const drawnBirds = record.layouts.pied.birds;
  assert.deepEqual(recordFailures(record, { drawnBirds, remeasured: { pied: ok, cotes: ok } }), []);
  assert.match(recordFailures(record, { drawnBirds, remeasured: { pied: ok, cotes: { overlap: 900, depth: 30, face: 0 } } })[0], /cotes.*hors-regle/);
  assert.match(recordFailures(record, { drawnBirds: [anchor('mee-fete', 4), anchor('meo-roi', 800)], remeasured: { pied: ok, cotes: ok } })[0], /périmée/);
  assert.match(recordFailures({ ...record, default: 'selfie' }, { drawnBirds, remeasured: { pied: ok, cotes: ok } })[0], /défaut/);
  assert.match(recordFailures(undefined, { drawnBirds, remeasured: {} })[0], /absent/);
});

test('l’export porte les mises en page déclarées et leur verdict, et refuse un relevé périmé', () => {
  const record = frameRecord({ frame: 'egypte-oracle-a', drawn: 'pied', measured: [{ layout: 'pied', birds: [anchor('mee-fete', 0), anchor('meo-roi', 800)], validated: ok }], unplaced: ['duo'] });
  const birds = exportedBirds(record, record.layouts.pied.birds);
  assert.deepEqual(birds, { default: 'pied', drawn: 'pied', layouts: { pied: { birds: record.layouts.pied.birds, validated: ok } } });
  assert.throws(() => exportedBirds(record, [anchor('mee-fete', 30), anchor('meo-roi', 800)]), /périmées/);
  assert.throws(() => exportedBirds(undefined, []), /absent/);
});
