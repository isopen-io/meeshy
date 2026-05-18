/**
 * Unit tests for embeddedReactionsToRows().
 *
 * Run:
 *   pnpm tsx scripts/__tests__/embedded-reactions-to-rows.test.ts
 *
 * Uses Node's built-in `assert` — no external test runner required.
 * Each test() call is self-contained (factory pattern, no shared state).
 */

import assert from 'node:assert/strict';
import { embeddedReactionsToRows } from '../lib/embedded-reactions-to-rows.js';

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

const VALID_POST_ID   = '507f1f77bcf86cd799439011';
const VALID_USER_ID_1 = '507f1f77bcf86cd799439012';
const VALID_USER_ID_2 = '507f1f77bcf86cd799439013';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('empty array returns empty rows and zero malformed count', () => {
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, []);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 0);
});

test('null input returns empty rows and zero malformed count', () => {
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, null);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 0);
});

test('non-array input returns empty rows and zero malformed count', () => {
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, 'not-an-array');
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 0);
});

test('valid single entry is mapped correctly', () => {
  const input = [{ userId: VALID_USER_ID_1, emoji: '👍', createdAt: '2024-01-15T10:00:00Z' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 1);
  assert.equal(malformedCount, 0);
  assert.equal(rows[0].postId, VALID_POST_ID);
  assert.equal(rows[0].userId, VALID_USER_ID_1);
  assert.equal(rows[0].emoji, '👍');
  assert.ok(rows[0].createdAt instanceof Date);
  assert.equal(rows[0].createdAt?.toISOString(), '2024-01-15T10:00:00.000Z');
});

test('valid entry without createdAt has undefined createdAt field', () => {
  const input = [{ userId: VALID_USER_ID_1, emoji: '❤️' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 1);
  assert.equal(malformedCount, 0);
  assert.equal(rows[0].createdAt, undefined);
});

test('multiple valid entries are all mapped', () => {
  const input = [
    { userId: VALID_USER_ID_1, emoji: '👍' },
    { userId: VALID_USER_ID_2, emoji: '🎉' },
  ];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 2);
  assert.equal(malformedCount, 0);
  assert.equal(rows[0].userId, VALID_USER_ID_1);
  assert.equal(rows[1].userId, VALID_USER_ID_2);
});

test('entry with missing userId is filtered out and counted as malformed', () => {
  const input = [{ emoji: '👍' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 1);
});

test('entry with null userId is filtered out and counted as malformed', () => {
  const input = [{ userId: null, emoji: '👍' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 1);
});

test('entry with numeric userId is filtered out and counted as malformed', () => {
  const input = [{ userId: 12345, emoji: '👍' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 1);
});

test('entry with non-ObjectId userId string is filtered out and counted as malformed', () => {
  // Too short and not hex
  const input = [{ userId: 'not-an-objectid', emoji: '👍' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 1);
});

test('entry with userId that is 24 chars but not all hex is filtered out', () => {
  // 24 chars but contains non-hex character 'z'
  const input = [{ userId: '507f1f77bcf86cd79943901z', emoji: '👍' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 1);
});

test('entry with missing emoji is filtered out and counted as malformed', () => {
  const input = [{ userId: VALID_USER_ID_1 }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 1);
});

test('entry with empty string emoji is filtered out and counted as malformed', () => {
  const input = [{ userId: VALID_USER_ID_1, emoji: '' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 1);
});

test('entry with whitespace-only emoji is filtered out and counted as malformed', () => {
  const input = [{ userId: VALID_USER_ID_1, emoji: '   ' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 1);
});

test('entry with non-string emoji is filtered out and counted as malformed', () => {
  const input = [{ userId: VALID_USER_ID_1, emoji: 42 }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 0);
  assert.equal(malformedCount, 1);
});

test('mixed valid and invalid entries — only valid ones are returned', () => {
  const input = [
    { userId: VALID_USER_ID_1, emoji: '👍' },         // valid
    { userId: 'bad-id', emoji: '❤️' },                  // invalid userId
    { userId: VALID_USER_ID_2, emoji: '🎉' },          // valid
    { emoji: '😂' },                                    // missing userId
    { userId: VALID_USER_ID_1, emoji: '' },             // empty emoji
  ];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 2);
  assert.equal(malformedCount, 3);
  assert.equal(rows[0].userId, VALID_USER_ID_1);
  assert.equal(rows[1].userId, VALID_USER_ID_2);
});

test('duplicate (userId, emoji) pair within same post — both rows returned (DB will dedup)', () => {
  // Decision: we do NOT pre-deduplicate. The DB @@unique constraint + P2002 handling
  // in the migration loop will silently discard the second insert. This keeps the
  // pure function simple and correct.
  const input = [
    { userId: VALID_USER_ID_1, emoji: '👍' },
    { userId: VALID_USER_ID_1, emoji: '👍' }, // exact duplicate
  ];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.equal(rows.length, 2);
  assert.equal(malformedCount, 0);
});

test('invalid createdAt string results in undefined createdAt (does not throw)', () => {
  const input = [{ userId: VALID_USER_ID_1, emoji: '👍', createdAt: 'not-a-date' }];
  const { rows, malformedCount } = embeddedReactionsToRows(VALID_POST_ID, input);
  // Entry is valid (userId and emoji are fine); only createdAt is dropped
  assert.equal(rows.length, 1);
  assert.equal(malformedCount, 0);
  assert.equal(rows[0].createdAt, undefined);
});

test('postId is propagated to every row', () => {
  const input = [
    { userId: VALID_USER_ID_1, emoji: '👍' },
    { userId: VALID_USER_ID_2, emoji: '❤️' },
  ];
  const { rows } = embeddedReactionsToRows(VALID_POST_ID, input);
  assert.ok(rows.every((r) => r.postId === VALID_POST_ID));
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Running embedded-reactions-to-rows tests...\n');
runAll();
