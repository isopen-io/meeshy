// Témoins du plan des cibles de fidélité (lot L21a, #10177) : ce que la commande `lib/cible.mjs` décide sans
// navigateur — quels cadres, quelles variantes, quel format, comment le rendu 1080×1920 descend à l'échelle de
// design, et ce que l'index versionné déclare. Usage : node --test lib/cible-plan.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAMPLE_FRAMES, VARIANTS, destinationOf, halve, indexOf, planTargets, selectCollections, targetName } from './cible-plan.mjs';

const manifests = {
  savane: [{ file: 'savane-ambassadeur-5.jpg', layout: 'perchés sur les huttes', message: null }, { file: 'savane-ambassadeur-1.jpg', layout: 'ruban (Mee fête, Meo champagne)', message: 'Pour toi' }],
  poses: [{ file: 'poses-pied.jpg', layout: 'pied', message: null }, { file: 'poses-ruban.jpg', layout: 'ruban', message: 'Merci' }],
};

test('un cadre par collection, dans sa mise en page cuite, avec et sans message, en 9:16 seulement', () => {
  const targets = planTargets({ collections: ['poses', 'savane'], manifests });
  assert.deepEqual(targets.map((t) => [t.collection, t.frame, t.variant, t.format]), [
    ['poses', 'poses-pied', 'plain', 'story'],
    ['poses', 'poses-pied', 'message', 'story'],
    ['savane', 'savane-ambassadeur-1', 'plain', 'story'],
    ['savane', 'savane-ambassadeur-1', 'message', 'story'],
  ]);
  assert.equal(targets[2].layout, 'ruban (Mee fête, Meo champagne)');
  assert.deepEqual(VARIANTS, ['plain', 'message']);
});

test('le jeu complet prend chaque cadre de chaque collection, toujours dans les deux variantes', () => {
  const targets = planTargets({ collections: ['poses', 'savane'], manifests, full: true });
  assert.equal(targets.length, 8);
  assert.deepEqual([...new Set(targets.map((t) => t.frame))], ['poses-pied', 'poses-ruban', 'savane-ambassadeur-5', 'savane-ambassadeur-1']);
});

test('une collection sans cadre échantillon déclaré prend son Ambassadeur I ; une collection inconnue du dossier est refusée', () => {
  assert.equal(SAMPLE_FRAMES.poses, 'poses-pied');
  assert.equal(planTargets({ collections: ['savane'], manifests })[0].frame, 'savane-ambassadeur-1');
  assert.throws(() => planTargets({ collections: ['nord'], manifests }), /nord/);
});

test('le nom du fichier cible porte le cadre et la variante, et se lit à rebours', () => {
  assert.equal(targetName({ frame: 'savane-ambassadeur-1', variant: 'message' }), 'savane-ambassadeur-1.message.webp');
  assert.equal(targetName({ frame: 'poses-message-cartouche', variant: 'plain' }), 'poses-message-cartouche.plain.webp');
});

test('halve : moyenne exacte 2×2 en alpha prémultiplié, arrondie au plus proche, et un pixel opaque reste opaque', () => {
  const raw = Buffer.from([
    255, 0, 0, 255,   0, 0, 255, 255,
    0, 255, 0, 255,   255, 255, 255, 255,
  ]);
  const out = halve(raw, 2, 2);
  assert.deepEqual([...out], [Math.round(510 / 4), Math.round(510 / 4), Math.round(510 / 4), 255]);
});

test('halve : un bloc à moitié transparent pèse sa couleur par son alpha, jamais par le noir des pixels vides', () => {
  const raw = Buffer.from([
    200, 100, 50, 255,   0, 0, 0, 0,
    200, 100, 50, 255,   0, 0, 0, 0,
  ]);
  const out = halve(raw, 2, 2);
  assert.deepEqual([...out], [200, 100, 50, 128]);
});

test('halve : la largeur et la hauteur doivent être paires, et la sortie fait le quart', () => {
  assert.throws(() => halve(Buffer.alloc(3 * 2 * 4), 3, 2), /pair/);
  assert.equal(halve(Buffer.alloc(4 * 6 * 4), 4, 6).length, 2 * 3 * 4);
});

test("l'index déclare le format 9:16 seul, le carré nul (D1, #10180), la photo fixture et la stabilité de chaque cible", () => {
  const index = indexOf({
    chromium: 'HeadlessChrome/1.0', sharp: '0.35.5', libwebp: '1.6.0',
    photo: { sha256: 'abc', bytes: 1234 },
    targets: [{ file: 'savane-ambassadeur-1.plain.webp', collection: 'savane', frame: 'savane-ambassadeur-1', variant: 'plain', layout: 'ruban', format: 'story', window: [128, 528, 824, 948], bytes: 10, sha256: 'ff', stable: true }],
  });
  assert.deepEqual(index.rendered, [1080, 1920]);
  assert.deepEqual(index.size, [540, 960]);
  assert.equal(index.formats.square, null);
  assert.match(index.formats.squareNote, /10180/);
  assert.equal(index.photo.fit, 'cover');
  assert.equal(index.photo.anchor, 'window.box');
  assert.equal(index.count, 1);
  assert.equal(index.targets[0].stable, true);
  assert.ok(!('note' in index.targets[0]));
});

test('un plan vide est rouge : une collection inconnue de `--only` est nommée, et zéro cible ne se rend pas', () => {
  assert.deepEqual(selectCollections({ available: ['savane', 'poses'], only: null }), ['poses', 'savane']);
  assert.deepEqual(selectCollections({ available: ['savane', 'poses'], only: new Set(['savane']) }), ['savane']);
  assert.throws(() => selectCollections({ available: ['savane', 'poses'], only: new Set(['nope', 'savane']) }), /nope/);
  assert.throws(() => selectCollections({ available: [], only: null }), /aucune collection/);
  assert.throws(() => planTargets({ collections: [], manifests }), /aucune cible/);
});

test("`--only` et `--final` exigent `--cible` : sans lui, ils écraseraient l'échantillon versionné ; `--check` compare sans écrire", () => {
  const here = '/repo/docs/product/cadres-de-gloire/generateur/lib';
  assert.equal(destinationOf({ here }), '/repo/docs/product/cadres-de-gloire/cible');
  assert.equal(destinationOf({ here, full: true }), '/repo/docs/product/cadres-de-gloire/generateur/cible-complete');
  assert.equal(destinationOf({ here, only: true, cible: '/tmp/x' }), '/tmp/x');
  assert.throws(() => destinationOf({ here, only: true }), /--cible/);
  assert.throws(() => destinationOf({ here, final: true }), /--cible/);
  assert.equal(destinationOf({ here, only: true, full: true }), '/repo/docs/product/cadres-de-gloire/generateur/cible-complete');
  assert.throws(() => destinationOf({ here, only: true, check: true }), /--check/);
  assert.throws(() => destinationOf({ here, final: true, check: true, cible: '/tmp/x' }), /--check/);
  assert.equal(destinationOf({ here, check: true }), '/repo/docs/product/cadres-de-gloire/cible');
});
