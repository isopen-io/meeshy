// Témoins de la cohérence de l'amendement L2 de la référence (reference/sha256.json, `amendments.l2`) avec le
// générateur : chaque cadre dont Mee et Meo ont bougé (lib/anchors.json) y porte les ancres et l'empreinte du SVG que
// le générateur produit aujourd'hui. Une ancre corrigée sans amendement rejoué laisse recompose.mjs juger le cadre
// contre le rendu d'un AUTRE dessin (#10265, neon-mythe-a). Un rendu qui reste à refaire (`png: null`) est une dette
// déclarée, jamais une dérive silencieuse. Aucun navigateur.
// Usage : node --test lib/amendment-rule.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { amendmentDrift } from './amendment-rule.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ANCHOR = Object.freeze([{ bird: 0, dx: -16, dy: 72, scale: 0.94 }]);
const entry = ({ anchors = ANCHOR, svg = 'aaa', png = 'bbb' } = {}) => ({ collection: 'neon', svg, png, designPng: true, anchors, decorDelta: 0 });

test("un amendement qui porte les ancres et l'empreinte du générateur ne dérive pas", () => {
  assert.deepEqual(amendmentDrift({ frames: { f: entry() }, anchors: { f: ANCHOR }, svg: { f: 'aaa' } }), { drift: [], pending: [] });
});

test("une ancre corrigée sans amendement rejoué est une dérive (neon-mythe-a, #10265)", () => {
  const stale = entry({ anchors: [{ bird: 0, dx: 0, dy: 72, scale: 1 }] });
  assert.deepEqual(amendmentDrift({ frames: { f: stale }, anchors: { f: ANCHOR } }).drift, [{ frame: 'f', reason: 'anchors' }]);
});

test("un SVG régénéré qui ne retrouve pas l'empreinte de son amendement est une dérive", () => {
  assert.deepEqual(amendmentDrift({ frames: { f: entry() }, anchors: { f: ANCHOR }, svg: { f: 'ccc' } }).drift, [{ frame: 'f', reason: 'svg' }]);
  assert.deepEqual(amendmentDrift({ frames: { f: entry() }, anchors: { f: ANCHOR }, svg: {} }).drift, [{ frame: 'f', reason: 'svg' }]);
});

test('un cadre ancré sans amendement, ou amendé sans ancre, dérive', () => {
  assert.deepEqual(amendmentDrift({ frames: {}, anchors: { f: ANCHOR } }).drift, [{ frame: 'f', reason: 'missing' }]);
  assert.deepEqual(amendmentDrift({ frames: { f: entry() }, anchors: {} }).drift, [{ frame: 'f', reason: 'orphan' }]);
});

test('un rendu à refaire est une dette déclarée, pas une dérive', () => {
  assert.deepEqual(amendmentDrift({ frames: { f: entry({ png: null }) }, anchors: { f: ANCHOR }, svg: { f: 'aaa' } }), { drift: [], pending: ['f'] });
});

test("l'amendement L2 versionné porte les ancres de lib/anchors.json", () => {
  const reference = JSON.parse(fs.readFileSync(path.join(HERE, '../../reference/sha256.json'), 'utf8'));
  const anchors = JSON.parse(fs.readFileSync(path.join(HERE, 'anchors.json'), 'utf8'));
  assert.deepEqual(amendmentDrift({ frames: reference.amendments.l2.frames, anchors }).drift, []);
});
