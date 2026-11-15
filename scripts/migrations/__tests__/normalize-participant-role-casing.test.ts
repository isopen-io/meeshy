/**
 * Tests unitaires de planNormalize().
 *
 * Run:
 *   npx tsx scripts/migrations/__tests__/normalize-participant-role-casing.test.ts
 *
 * Utilise `node:assert` — aucun runner externe : `scripts/` n'est couvert ni par
 * jest ni par vitest. Même harnais que scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  planNormalize,
  CANONICAL_MEMBER_ROLES,
  type ParticipantRow,
} from '../normalize-participant-role-casing.js';

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

const row = (id: string, role: string | null | undefined): ParticipantRow => ({ _id: id, role });

// ---------------------------------------------------------------------------
// Garde de dérive : le miroir doit rester égal à la source
// ---------------------------------------------------------------------------

test('CANONICAL_MEMBER_ROLES est identique à Object.values(MemberRole) de role-types.ts', () => {
  const sharedPath = path.resolve(__dirname, '../../../packages/shared/types/role-types.ts');
  const source = readFileSync(sharedPath, 'utf8');
  // Extrait les valeurs `= '...'` de l'enum MemberRole, dans l'ordre déclaré.
  const enumBlockMatch = source.match(/export enum MemberRole \{([\s\S]*?)\}/);
  assert.ok(enumBlockMatch, 'enum MemberRole introuvable dans role-types.ts');
  const values = [...enumBlockMatch[1].matchAll(/=\s*'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...CANONICAL_MEMBER_ROLES], values);
});

// ---------------------------------------------------------------------------
// planNormalize
// ---------------------------------------------------------------------------

test('normalise une casse majuscule vers sa forme canonique', () => {
  const plan = planNormalize([row('1', 'MEMBER'), row('2', 'ADMIN'), row('3', 'CREATOR'), row('4', 'MODERATOR')]);
  assert.equal(plan.skips.length, 0);
  assert.deepEqual(plan.fixes, [
    { id: '1', from: 'MEMBER', to: 'member' },
    { id: '2', from: 'ADMIN', to: 'admin' },
    { id: '3', from: 'CREATOR', to: 'creator' },
    { id: '4', from: 'MODERATOR', to: 'moderator' },
  ]);
});

test('normalise une casse mixte (Titlecase)', () => {
  const plan = planNormalize([row('1', 'Admin')]);
  assert.deepEqual(plan.fixes, [{ id: '1', from: 'Admin', to: 'admin' }]);
});

test('ne touche pas une ligne déjà en minuscules', () => {
  const plan = planNormalize([row('1', 'member'), row('2', 'admin'), row('3', 'creator'), row('4', 'moderator')]);
  assert.equal(plan.fixes.length, 0);
  assert.equal(plan.skips.length, 0);
});

test('est idempotent : rejouer sur le résultat ne produit plus rien', () => {
  const first = planNormalize([row('1', 'ADMIN')]);
  const second = planNormalize([row('1', first.fixes[0].to)]);
  assert.equal(second.fixes.length, 0);
  assert.equal(second.skips.length, 0);
});

test('traite un role absent comme le défaut du schéma ("member"), déjà canonique', () => {
  const plan = planNormalize([row('1', null), row('2', undefined)]);
  assert.equal(plan.fixes.length, 0);
  assert.equal(plan.skips.length, 0);
});

test('rogne les espaces autour du rôle avant de comparer', () => {
  const plan = planNormalize([row('1', '  ADMIN  ')]);
  assert.deepEqual(plan.fixes, [{ id: '1', from: '  ADMIN  ', to: 'admin' }]);
});

// Le témoin ci-dessus ne peut pas tomber sur le rognage seul : `'  ADMIN  '`
// sort déjà par la branche MAJUSCULES. Celui-ci l'isole — une valeur dont SEULS
// les espaces sont fautifs. Classer sur la forme rognée la donnait pour « déjà
// canonique » et laissait la BASE avec ses espaces, où `hasMinimumMemberRole`
// retombe au niveau 0 (membre rétrogradé, en silence).
test('normalise une valeur dont SEULS les espaces sont fautifs', () => {
  const plan = planNormalize([row('1', ' member '), row('2', 'admin ')]);
  assert.equal(plan.skips.length, 0);
  assert.deepEqual(plan.fixes, [
    { id: '1', from: ' member ', to: 'member' },
    { id: '2', from: 'admin ', to: 'admin' },
  ]);
});

test('reste idempotent après un fix de pur espacement', () => {
  const first = planNormalize([row('1', ' member ')]);
  const second = planNormalize([row('1', first.fixes[0].to)]);
  assert.equal(second.fixes.length, 0);
  assert.equal(second.skips.length, 0);
});

test('saute un rôle inconnu au lieu de deviner, quelle que soit sa casse', () => {
  const plan = planNormalize([row('1', 'OWNER')]);
  assert.equal(plan.fixes.length, 0);
  assert.deepEqual(plan.skips, [{ id: '1', role: 'OWNER', reason: 'unrecognized-role' }]);
});

test('ne confond pas deux participations distinctes', () => {
  const plan = planNormalize([row('1', 'ADMIN'), row('2', 'admin'), row('3', 'OWNER')]);
  assert.deepEqual(plan.fixes, [{ id: '1', from: 'ADMIN', to: 'admin' }]);
  assert.deepEqual(plan.skips, [{ id: '3', role: 'OWNER', reason: 'unrecognized-role' }]);
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Running normalize-participant-role-casing tests...\n');
runAll();
