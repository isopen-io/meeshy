/**
 * Tests unitaires de planRename().
 *
 * Run:
 *   npx tsx scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts
 *
 * Utilise `node:assert` — aucun runner externe : `scripts/` n'est couvert ni par
 * jest ni par vitest. Même harnais que scripts/__tests__/embedded-reactions-to-rows.test.ts.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planRename, USERNAME_PATTERN_SOURCE, type UserRow } from '../strip-spaces-from-usernames.js';

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

function runAll(): void {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed += 1;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const row = (over: Partial<UserRow> & Pick<UserRow, '_id' | 'username'>): UserRow => ({
  email: 'a@b.co',
  firstName: 'A',
  systemLanguage: 'fr',
  ...over,
});

// ---------------------------------------------------------------------------
// Garde de dérive : le miroir doit rester égal à la source
// ---------------------------------------------------------------------------

test('USERNAME_PATTERN_SOURCE est identique à la source partagée', () => {
  const sharedPath = path.resolve(__dirname, '../../../packages/shared/types/api-schemas.ts');
  const source = readFileSync(sharedPath, 'utf8');
  const match = source.match(/export const usernamePatternSource = "(.+?)";/);
  assert.ok(match, 'usernamePatternSource introuvable dans api-schemas.ts');
  assert.equal(USERNAME_PATTERN_SOURCE, match[1]);
});

// ---------------------------------------------------------------------------
// planRename
// ---------------------------------------------------------------------------

test('retire les espaces d\'un username récupérable', () => {
  const plan = planRename([row({ _id: '1', username: 'la lionne noire', firstName: 'La Lionne Noire' })]);
  assert.equal(plan.skips.length, 0);
  assert.deepEqual(plan.renames, [
    { id: '1', from: 'la lionne noire', to: 'lalionnenoire', email: 'a@b.co', name: 'La Lionne Noire', language: 'fr' },
  ]);
});

test('ne touche pas un username déjà propre', () => {
  const plan = planRename([row({ _id: '1', username: 'alice' })]);
  assert.equal(plan.renames.length, 0);
  assert.equal(plan.skips.length, 0);
});

test('est idempotent : rejouer sur le résultat ne produit plus rien', () => {
  const first = planRename([row({ _id: '1', username: 'vanel momo' })]);
  const second = planRename([row({ _id: '1', username: first.renames[0].to })]);
  assert.equal(second.renames.length, 0);
  assert.equal(second.skips.length, 0);
});

test('saute une collision insensible à la casse au lieu de deviner', () => {
  const plan = planRename([
    row({ _id: '1', username: 'vanel momo' }),
    row({ _id: '2', username: 'VanelMomo' }),
  ]);
  assert.equal(plan.renames.length, 0);
  assert.deepEqual(plan.skips, [{ id: '1', username: 'vanel momo', reason: 'collision' }]);
});

test('ne se compte pas comme sa propre collision', () => {
  const plan = planRename([row({ _id: '1', username: 'a lice' })]);
  assert.deepEqual(plan.renames.map((r) => r.to), ['alice']);
});

test('saute un username trop court après suppression', () => {
  const plan = planRename([row({ _id: '1', username: 'a ' })]);
  assert.equal(plan.renames.length, 0);
  assert.deepEqual(plan.skips, [{ id: '1', username: 'a ', reason: 'too-short' }]);
});

test('saute un username trop long après suppression', () => {
  const long = `${'a'.repeat(10)} ${'b'.repeat(10)}`;
  const plan = planRename([row({ _id: '1', username: long })]);
  assert.deepEqual(plan.skips, [{ id: '1', username: long, reason: 'too-long' }]);
});

test('saute un username qui reste non conforme après suppression', () => {
  const plan = planRename([row({ _id: '1', username: 'jos é.m' })]);
  assert.equal(plan.renames.length, 0);
  assert.deepEqual(plan.skips, [{ id: '1', username: 'jos é.m', reason: 'still-invalid' }]);
});

test('retombe sur le username comme nom d\'adresse quand firstName manque', () => {
  const plan = planRename([row({ _id: '1', username: 'vanel momo', firstName: null })]);
  assert.equal(plan.renames[0].name, 'vanel momo');
});

test('retombe sur fr quand systemLanguage manque', () => {
  const plan = planRename([row({ _id: '1', username: 'vanel momo', systemLanguage: null })]);
  assert.equal(plan.renames[0].language, 'fr');
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Running strip-spaces-from-usernames tests...\n');
runAll();
