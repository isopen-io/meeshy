import { describe, it, expect } from 'vitest';
import {
  validateSchema,
  CommonSchemas,
  containsEmoji,
  zeroizeBuffer,
  copyAndZeroize,
  ApiResponseSchemas,
  SignalValidation,
  UserSchemas,
  updateBannerSchema,
  updateUserProfileSchema,
  AuthSchemas,
  SignalProtocolLimits,
} from '../utils/validation.js';
import { z } from 'zod';
import { MeeshyError } from '../utils/errors.js';

describe('validateSchema', () => {
  const testSchema = z.object({
    name: z.string().min(1),
  });

  it('should return data for valid input', () => {
    const input = { name: 'John' };
    expect(validateSchema(testSchema, input)).toEqual(input);
  });

  it('should throw MeeshyError for invalid input', () => {
    expect(() => validateSchema(testSchema, { name: '' })).toThrow(MeeshyError);
  });
});

describe('CommonSchemas', () => {
  it('pagination should parse defaults', () => {
    const result = CommonSchemas.pagination.parse({});
    expect(result).toEqual({ limit: 20, offset: 0 });
  });

  it('pagination parses valid numeric strings', () => {
    expect(CommonSchemas.pagination.parse({ limit: '50', offset: '10' })).toEqual({ limit: 50, offset: 10 });
  });

  it('pagination coerces non-numeric input to safe defaults', () => {
    expect(CommonSchemas.pagination.parse({ limit: 'abc' })).toEqual({ limit: 20, offset: 0 });
    expect(CommonSchemas.pagination.parse({ offset: 'xyz' })).toEqual({ limit: 20, offset: 0 });
  });

  it('pagination clamps negative and zero to safe bounds', () => {
    const result = CommonSchemas.pagination.parse({ limit: '-5', offset: '-10' });
    expect(result.limit).toBeGreaterThanOrEqual(1);
    expect(result.offset).toBeGreaterThanOrEqual(0);
    expect(CommonSchemas.pagination.parse({ limit: '0' }).limit).toBeGreaterThanOrEqual(1);
  });

  it('pagination caps limit at the maximum', () => {
    expect(CommonSchemas.pagination.parse({ limit: '9999' }).limit).toBe(100);
  });

  it('messagePagination coerces garbage/negative like pagination', () => {
    const result = CommonSchemas.messagePagination.parse({ limit: 'abc', offset: '-3' });
    expect(result.limit).toBe(20);
    expect(result.offset).toBeGreaterThanOrEqual(0);
  });

  it('mongoId should validate format', () => {
    expect(CommonSchemas.mongoId.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
    expect(CommonSchemas.mongoId.safeParse('invalid').success).toBe(false);
  });

  describe('language', () => {
    it('accepts ISO 639-1 two-letter codes and returns them canonical', () => {
      expect(CommonSchemas.language.parse('fr')).toBe('fr');
      expect(CommonSchemas.language.parse('en')).toBe('en');
    });

    it('accepts ISO 639-3 three-letter supported codes verbatim', () => {
      // Cameroonian languages first-class in packages/shared/utils/languages.ts
      // and preserved verbatim by normalizeLanguageCode — must not be rejected
      // on sendMessage/editMessage while systemLanguage/regionalLanguage accept them.
      for (const code of ['bas', 'ksf', 'nnh', 'dua', 'ewo']) {
        expect(CommonSchemas.language.parse(code)).toBe(code);
      }
    });

    it('normalizes region / script / case variants to the canonical persisted code', () => {
      // originalLanguage is persisted VERBATIM by MessagingService, then compared
      // against the reader's normalized language (`originalLanguage === userLanguage`).
      // Storing a raw BCP-47 tag (`en-US`, `zh-Hant-HK`) would never match `en`/`zh`,
      // marking the message eternally "foreign" — a Prisme Linguistique corruption.
      // Normalizing at the trust boundary via the SSOT keeps the persisted value canonical.
      expect(CommonSchemas.language.parse('en-US')).toBe('en');
      expect(CommonSchemas.language.parse('EN')).toBe('en');
      expect(CommonSchemas.language.parse('fr-FR')).toBe('fr');
      expect(CommonSchemas.language.parse('zh-Hant-HK')).toBe('zh');
      expect(CommonSchemas.language.parse('es-419')).toBe('es');
      // 3-letter supported code + region: matched the old regex but was rejected
      // by the contradictory max(5) length cap. Now accepted and reduced to `bas`.
      expect(CommonSchemas.language.parse('bas-CM')).toBe('bas');
    });

    it('rejects malformed / non-reducible codes', () => {
      expect(CommonSchemas.language.safeParse('f').success).toBe(false);
      expect(CommonSchemas.language.safeParse('english').success).toBe(false);
      expect(CommonSchemas.language.safeParse('fr2').success).toBe(false);
      expect(CommonSchemas.language.safeParse('').success).toBe(false);
      expect(CommonSchemas.language.safeParse('123').success).toBe(false);
      expect(CommonSchemas.language.safeParse('@@').success).toBe(false);
    });
  });
});

describe('containsEmoji', () => {
  it('should detect emojis', () => {
    expect(containsEmoji('Hi 🚀')).toBe(true);
    expect(containsEmoji('Plain text')).toBe(false);
  });
});

describe('Buffer Utilities', () => {
  it('zeroizeBuffer should clear data', () => {
    const buf = Buffer.from([1, 2, 3]);
    zeroizeBuffer(buf);
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(0);

    // Test with Uint8Array
    const u8 = new Uint8Array([4, 5, 6]);
    zeroizeBuffer(u8);
    expect(u8[0]).toBe(0);

    // Test with null
    expect(() => zeroizeBuffer(null)).not.toThrow();
  });

  it('copyAndZeroize should work', () => {
    const buf = Buffer.from([1, 2, 3]);
    const copy = copyAndZeroize(buf);
    expect(copy).toEqual(Buffer.from([1, 2, 3]));
    expect(buf[0]).toBe(0);
  });
});

describe('SignalValidation', () => {
  it('validateMessageSize should check length', () => {
    expect(SignalValidation.validateMessageSize('test').valid).toBe(true);
    expect(SignalValidation.validateMessageSize('').valid).toBe(false);
    expect(SignalValidation.validateMessageSize('a'.repeat(70000)).valid).toBe(false);
  });

  it('validateMessageNumber should check range', () => {
    expect(SignalValidation.validateMessageNumber(10, 5).valid).toBe(true);
    expect(SignalValidation.validateMessageNumber(-1, 0).valid).toBe(false);
    expect(SignalValidation.validateMessageNumber(1000, 0, 100).valid).toBe(false);
  });

  it('validateKeyBuffer should check size', () => {
    const buf = Buffer.alloc(32);
    expect(SignalValidation.validateKeyBuffer(buf, 32).valid).toBe(true);
    expect(SignalValidation.validateKeyBuffer(buf, 16).valid).toBe(false);
    expect(SignalValidation.validateKeyBuffer(null, 32).valid).toBe(false);
  });

  it('validateRegistrationId should check range', () => {
    expect(SignalValidation.validateRegistrationId(5000).valid).toBe(true);
    expect(SignalValidation.validateRegistrationId(0).valid).toBe(false);
    expect(SignalValidation.validateRegistrationId(20000).valid).toBe(false);
  });

  it('validatePreKeyId should check range', () => {
    expect(SignalValidation.validatePreKeyId(100).valid).toBe(true);
    expect(SignalValidation.validatePreKeyId(-1).valid).toBe(false);
  });

  it('validateEncryptedPayload should check structure', () => {
    const payload = {
      ciphertext: Buffer.from('abc'),
      iv: Buffer.alloc(12),
      authTag: Buffer.alloc(16)
    };
    expect(SignalValidation.validateEncryptedPayload(payload).valid).toBe(true);
    expect(SignalValidation.validateEncryptedPayload({}).valid).toBe(false);
  });
});

describe('ApiResponseSchemas', () => {
  it('success should wrap schema', () => {
    const s = ApiResponseSchemas.success(z.string());
    expect(s.safeParse({ success: true, data: 'ok' }).success).toBe(true);
  });

  it('paginatedList should work', () => {
    const s = ApiResponseSchemas.paginatedList(z.string());
    const data = { success: true, data: { items: ['a'], totalCount: 1 } };
    expect(s.safeParse(data).success).toBe(true);
  });
});

describe('UserSchemas', () => {
  it('should validate minimal user', () => {
    const user = { id: '1', username: 'u', displayName: 'd' };
    expect(UserSchemas.minimal.safeParse(user).success).toBe(true);
  });
});

describe('language-code normalization at the write boundary', () => {
  it('updateUserProfileSchema lowercases in-app language prefs', () => {
    const parsed = updateUserProfileSchema.parse({
      systemLanguage: 'EN',
      regionalLanguage: 'Fr',
      customDestinationLanguage: 'DE',
    });
    expect(parsed.systemLanguage).toBe('en');
    expect(parsed.regionalLanguage).toBe('fr');
    expect(parsed.customDestinationLanguage).toBe('de');
  });

  it('AuthSchemas.register lowercases system/regional language', () => {
    const parsed = AuthSchemas.register.parse({
      username: 'alice',
      password: 'password123',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      systemLanguage: 'EN',
      regionalLanguage: 'ES',
    });
    expect(parsed.systemLanguage).toBe('en');
    expect(parsed.regionalLanguage).toBe('es');
  });

  it('AuthSchemas.register still rejects unsupported codes', () => {
    const result = AuthSchemas.register.safeParse({
      username: 'alice',
      password: 'password123',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      systemLanguage: 'zz',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBannerSchema', () => {
  it('accepts http:// URLs', () => {
    expect(updateBannerSchema.safeParse({ banner: 'http://example.com/img.png' }).success).toBe(true);
  });

  it('accepts https:// URLs', () => {
    expect(updateBannerSchema.safeParse({ banner: 'https://cdn.meeshy.me/banner.jpg' }).success).toBe(true);
  });

  it('accepts /api/ paths', () => {
    expect(updateBannerSchema.safeParse({ banner: '/api/v1/static/banner.jpg' }).success).toBe(true);
  });

  it('rejects arbitrary strings', () => {
    expect(updateBannerSchema.safeParse({ banner: 'ftp://bad.com' }).success).toBe(false);
  });

  it('rejects relative paths without /api/', () => {
    expect(updateBannerSchema.safeParse({ banner: '/uploads/img.jpg' }).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(updateBannerSchema.safeParse({ banner: '' }).success).toBe(false);
  });
});

describe('SignalValidation.validateMessageNumber — overflow branch', () => {
  it('returns MESSAGE_NUMBER_OVERFLOW when number exceeds MAX_MESSAGE_NUMBER', () => {
    const overflow = SignalProtocolLimits.MAX_MESSAGE_NUMBER + 1;
    const result = SignalValidation.validateMessageNumber(overflow, 0);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('MESSAGE_NUMBER_OVERFLOW');
    expect(result.error).toContain(String(SignalProtocolLimits.MAX_MESSAGE_NUMBER));
  });

  it('accepts MAX_MESSAGE_NUMBER itself', () => {
    const max = SignalProtocolLimits.MAX_MESSAGE_NUMBER;
    const result = SignalValidation.validateMessageNumber(max, max - 1, SignalProtocolLimits.MAX_SKIPPED_KEYS);
    expect(result.valid).toBe(true);
  });
});
