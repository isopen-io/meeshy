#!/usr/bin/env node
// Le VERDICT d'une chaîne de CI : l'agrégateur rougit quand un job dont il dépend est rouge.
//
// Un agrégateur `if: always()` qui ne fait qu'écrire un tableau conclut « success » même quand
// un job a échoué : le tableau dit la vérité, la case à cocher non. Ici, l'agrégateur lit
// `toJSON(needs)` et sort 1 en nommant les jobs rouges.
//
// `failure` et `cancelled` sont rouges. `skipped` est vert : un job sauté par sa zone n'a rien
// à prouver, et le sauter parce qu'un amont a échoué rougit déjà cet amont.
//
// Usage (dans le job, NEEDS_JSON posé) :
//   node scripts/ci/needs-verdict.mjs
//   node scripts/ci/needs-verdict.mjs --self-test

import assert from 'node:assert/strict';

export const rouges = (needs) =>
  Object.entries(needs)
    .filter(([, job]) => job?.result === 'failure' || job?.result === 'cancelled')
    .map(([nom]) => nom)
    .sort();

const verdict = (needs) => {
  const enRouge = rouges(needs);
  return enRouge.length === 0
    ? { code: 0, message: `Verdict : vert (${Object.keys(needs).length} jobs jugés).` }
    : { code: 1, message: `Verdict : rouge — ${enRouge.join(', ')}` };
};

const autoTest = () => {
  assert.deepEqual(rouges({}), []);
  assert.deepEqual(rouges({ a: { result: 'success' }, b: { result: 'skipped' } }), []);
  assert.deepEqual(rouges({ b: { result: 'failure' }, a: { result: 'cancelled' }, c: { result: 'success' } }), ['a', 'b']);
  assert.deepEqual(rouges({ a: null, b: {} }), []);
  assert.equal(verdict({ prisma: { result: 'failure' }, build: { result: 'skipped' } }).code, 1);
  assert.match(verdict({ prisma: { result: 'failure' } }).message, /prisma/);
  assert.equal(verdict({ x: { result: 'success' }, y: { result: 'skipped' } }).code, 0);
  console.log('needs-verdict --self-test : 7 cas tenus');
};

const main = () => {
  if (process.argv.includes('--self-test')) return autoTest();
  const brut = process.env.NEEDS_JSON;
  if (!brut) {
    console.error('::error title=Verdict::NEEDS_JSON absent : le job doit poser env NEEDS_JSON: ${{ toJSON(needs) }}');
    process.exit(2);
  }
  const { code, message } = verdict(JSON.parse(brut));
  console.log(message);
  if (code !== 0) console.error(`::error title=Verdict::${message}`);
  process.exit(code);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
