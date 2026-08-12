import { OBJECT_ID_REGEX, isValidObjectId } from '@/utils/object-id';

describe('object-id', () => {
  describe('isValidObjectId', () => {
    it('accepts a valid 24-char hex ObjectId', () => {
      expect(isValidObjectId('68ee540df062ef6a37bd3cca')).toBe(true);
      expect(isValidObjectId('AABBCCDDEEFF001122334455')).toBe(true);
    });

    it('rejects strings that are not 24 hex characters', () => {
      expect(isValidObjectId('')).toBe(false);
      expect(isValidObjectId('68ee540df062ef6a37bd3cc')).toBe(false); // 23 chars
      expect(isValidObjectId('68ee540df062ef6a37bd3cca0')).toBe(false); // 25 chars
      expect(isValidObjectId('zzee540df062ef6a37bd3cca')).toBe(false); // non-hex
      expect(isValidObjectId('68ee540df062ef6a37bd3cca.2510141545_ordljlc5')).toBe(false);
    });

    it('rejects non-string values without throwing', () => {
      expect(isValidObjectId(undefined as unknown as string)).toBe(false);
      expect(isValidObjectId(null as unknown as string)).toBe(false);
    });
  });

  describe('OBJECT_ID_REGEX', () => {
    it('matches exactly 24 hexadecimal characters', () => {
      expect(OBJECT_ID_REGEX.test('68ee540df062ef6a37bd3cca')).toBe(true);
      expect(OBJECT_ID_REGEX.test('not-an-object-id')).toBe(false);
    });
  });
});
