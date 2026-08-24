import { describe, it, expect } from 'vitest';
import { OBJECT_ID_REGEX, OBJECT_ID_PATTERN, isValidObjectId } from '../../utils/object-id.js';
import { CommonSchemas } from '../../utils/validation.js';
import { mongoIdSchema } from '../../types/validation.js';
import { isValidMongoId } from '../../utils/conversation-helpers.js';
import { isValidObjectId as isValidObjectIdMigration } from '../../types/migration-utils.js';

const VALID = [
  '507f1f77bcf86cd799439011',
  '000000000000000000000000',
  'ffffffffffffffffffffffff',
  'ABCDEF123456789012345678', // uppercase hex is valid
  'AABBCCDDEEFF001122334455',
];

const INVALID = [
  '', // empty
  '123', // too short
  '507f1f77bcf86cd79943901', // 23 chars
  '507f1f77bcf86cd7994390111', // 25 chars
  '507f1f77bcf86cd79943901g', // non-hex char
  'not-a-mongo-id',
  ' 507f1f77bcf86cd799439011', // leading space
  '507f1f77bcf86cd799439011 ', // trailing space
];

describe('isValidObjectId (shared SSOT)', () => {
  it('accepts canonical 24-char hex ids in both cases', () => {
    for (const id of VALID) expect(isValidObjectId(id)).toBe(true);
  });

  it('rejects malformed ids', () => {
    for (const id of INVALID) expect(isValidObjectId(id)).toBe(false);
  });

  it('is a type guard that rejects non-string inputs', () => {
    expect(isValidObjectId(undefined)).toBe(false);
    expect(isValidObjectId(null)).toBe(false);
    expect(isValidObjectId(42)).toBe(false);
    expect(isValidObjectId({})).toBe(false);
  });
});

describe('OBJECT_ID_REGEX', () => {
  it('matches exactly the 24-char hex language', () => {
    for (const id of VALID) expect(OBJECT_ID_REGEX.test(id)).toBe(true);
    for (const id of INVALID) expect(OBJECT_ID_REGEX.test(id)).toBe(false);
  });
});

// The string form of the SSOT, for consumers that cannot take a compiled RegExp:
// Fastify/ajv route schemas declare validation as a `pattern` string, and that
// string `'^[0-9a-fA-F]{24}$'` was hand-inlined across the gateway with no source.
// It is derived from OBJECT_ID_REGEX.source so the whole package keeps exactly ONE
// regex literal — string and RegExp can never drift.
describe('OBJECT_ID_PATTERN (string form of the SSOT)', () => {
  it('is exactly OBJECT_ID_REGEX.source', () => {
    expect(OBJECT_ID_PATTERN).toBe(OBJECT_ID_REGEX.source);
  });

  it('carries its own anchors so it matches the same language as a string pattern', () => {
    const compiled = new RegExp(OBJECT_ID_PATTERN);
    for (const id of VALID) expect(compiled.test(id)).toBe(true);
    for (const id of INVALID) expect(compiled.test(id)).toBe(false);
  });
});

// Witness that the four previously-independent copies now agree on every input.
// This is the guard the SSOT exists to hold: before consolidation the two Zod
// schemas used syntactically different regexes (`/^[a-f\d]{24}$/i` vs
// `/^[0-9a-fA-F]{24}$/`) — a divergence one edit away from becoming behavioural.
describe('all shared ObjectId predicates agree', () => {
  const predicates: ReadonlyArray<[string, (id: string) => boolean]> = [
    ['isValidObjectId', (id) => isValidObjectId(id)],
    ['isValidMongoId', (id) => isValidMongoId(id)],
    ['isValidObjectId(migration)', (id) => isValidObjectIdMigration(id)],
    ['CommonSchemas.mongoId', (id) => CommonSchemas.mongoId.safeParse(id).success],
    ['mongoIdSchema', (id) => mongoIdSchema.safeParse(id).success],
  ];

  it('all accept every valid id', () => {
    for (const id of VALID) {
      for (const [name, p] of predicates) {
        expect([name, id, p(id)]).toEqual([name, id, true]);
      }
    }
  });

  it('all reject every invalid id', () => {
    for (const id of INVALID) {
      for (const [name, p] of predicates) {
        expect([name, id, p(id)]).toEqual([name, id, false]);
      }
    }
  });
});
