import { validatePagination, MAX_PAGINATION_OFFSET } from '../../../utils/pagination';

/**
 * Iter 33 — single source of truth for offset/limit pagination parsing.
 * Replaces 9 per-route copies; adds the offset upper bound that none of
 * the copies had (offset=1e15 previously reached MongoDB skip untouched).
 */
describe('validatePagination', () => {
  it('returns defaults when called without arguments', () => {
    expect(validatePagination()).toEqual({ offset: 0, limit: 20 });
  });

  it('parses valid offset and limit strings', () => {
    expect(validatePagination('40', '50')).toEqual({ offset: 40, limit: 50 });
  });

  it('falls back to defaultLimit ONLY when limit is missing or unparsable', () => {
    expect(validatePagination('0', undefined, { defaultLimit: 50 }).limit).toBe(50);
    expect(validatePagination('0', 'abc', { defaultLimit: 50 }).limit).toBe(50);
    // An empty string is unparsable → default, not the minimum.
    expect(validatePagination('0', '', { defaultLimit: 50 }).limit).toBe(50);
  });

  it('clamps limit to maxLimit', () => {
    expect(validatePagination('0', '500').limit).toBe(100);
    expect(validatePagination('0', '80', { maxLimit: 50 }).limit).toBe(50);
  });

  it('enforces a minimum limit of 1 for explicit below-minimum values', () => {
    // An EXPLICIT limit below the minimum (0 or negative) is a parsable value,
    // not a missing one — it clamps to the floor (1), never to defaultLimit.
    // Before this fix `'0'` was falsy-coerced to defaultLimit (20) while `'-5'`
    // clamped to 1: two below-minimum inputs treated inconsistently.
    expect(validatePagination('0', '0').limit).toBe(1);
    expect(validatePagination('0', '0', { defaultLimit: 50 }).limit).toBe(1);
    expect(validatePagination('0', '-5').limit).toBe(1);
  });

  it('clamps negative or unparsable offsets to 0', () => {
    expect(validatePagination('-10', '20').offset).toBe(0);
    expect(validatePagination('abc', '20').offset).toBe(0);
  });

  it('caps the offset at MAX_PAGINATION_OFFSET by default', () => {
    expect(validatePagination('1000000000000000', '20').offset).toBe(MAX_PAGINATION_OFFSET);
  });

  it('caps the offset at a custom maxOffset', () => {
    expect(validatePagination('5000', '20', { maxOffset: 1000 }).offset).toBe(1000);
  });

  it('keeps offsets under the cap untouched', () => {
    expect(validatePagination(String(MAX_PAGINATION_OFFSET - 1), '20').offset).toBe(MAX_PAGINATION_OFFSET - 1);
  });
});
