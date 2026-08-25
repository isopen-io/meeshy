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
  NotificationPreferenceSchemas,
  updateUsernameSchema,
  SignalSchemas,
  MessageSchemas,
  TranslatedAudioSchemas,
  VoiceModelSchemas,
  AnonymousParticipantSchemas,
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

  it('pagination floors an explicit below-minimum limit to exactly 1', () => {
    // Regression: `limit=0` must clamp to the floor of 1, NOT leak a full page
    // of 20. The former `parseInt(...) || 20` conflated `0` (falsy) with
    // "absent" — `limit=-5` floored to 1 but `limit=0` returned 20.
    expect(CommonSchemas.pagination.parse({ limit: '0' }).limit).toBe(1);
    expect(CommonSchemas.pagination.parse({ limit: '-5', offset: '-10' })).toEqual({ limit: 1, offset: 0 });
  });

  it('pagination caps limit at the maximum', () => {
    expect(CommonSchemas.pagination.parse({ limit: '9999' }).limit).toBe(100);
  });

  it('messagePagination coerces garbage/negative like pagination', () => {
    const result = CommonSchemas.messagePagination.parse({ limit: 'abc', offset: '-3' });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
    expect(CommonSchemas.messagePagination.parse({ limit: '0' }).limit).toBe(1);
  });

  it('mongoId should validate format', () => {
    expect(CommonSchemas.mongoId.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
    expect(CommonSchemas.mongoId.safeParse('invalid').success).toBe(false);
  });

  describe('language', () => {
    it('accepts ISO 639-1 two-letter codes', () => {
      expect(CommonSchemas.language.safeParse('fr').success).toBe(true);
      expect(CommonSchemas.language.safeParse('en').success).toBe(true);
    });

    it('accepts ISO 639-3 three-letter supported codes', () => {
      // Cameroonian languages first-class in packages/shared/utils/languages.ts
      // and preserved verbatim by normalizeLanguageCode — must not be rejected
      // on sendMessage/editMessage while systemLanguage/regionalLanguage accept them.
      for (const code of ['bas', 'ksf', 'nnh', 'dua', 'ewo']) {
        expect(CommonSchemas.language.safeParse(code).success).toBe(true);
      }
    });

    it('accepts a BCP-47 region subtag', () => {
      expect(CommonSchemas.language.safeParse('en-US').success).toBe(true);
    });

    it('accepts a three-letter code WITH a region subtag', () => {
      // `bas-CM` (639-3 body + ISO 3166-1 region) is 6 chars — the max the regex
      // `[a-z]{2,3}(-[A-Z]{2})?` allows. The former `.max(5)` cap contradicted the
      // regex and rejected these supported Cameroonian codes on sendMessage/edit
      // (the same class of bug the {2}->{2,3} relax targeted, left open for the
      // regionalized form).
      for (const code of ['bas-CM', 'ewo-CM', 'ksf-CM']) {
        expect(CommonSchemas.language.safeParse(code).success).toBe(true);
      }
    });

    it('rejects malformed codes', () => {
      expect(CommonSchemas.language.safeParse('f').success).toBe(false);
      expect(CommonSchemas.language.safeParse('english').success).toBe(false);
      expect(CommonSchemas.language.safeParse('EN').success).toBe(false);
      expect(CommonSchemas.language.safeParse('fr2').success).toBe(false);
    });
  });

  // Les schémas de contenu ci-dessous portaient chacun leur propre borne
  // `.max(5)`, qui rejouait EXACTEMENT la régression que `CommonSchemas.language`
  // documente avoir corrigée (`.max(6)` : le plafond de la regex
  // `[a-z]{2,3}(-[A-Z]{2})?`, ex. `bas-CM`). Le Prisme s'appliquant à TOUT le
  // contenu, la classe se ferme sur les cinq — message, audio, modèle vocal,
  // participant anonyme.
  describe('language-code bound parity with CommonSchemas.language', () => {
    it('MessageSchemas.send/edit accept a region-tagged 6-char originalLanguage', () => {
      expect(MessageSchemas.send.safeParse({ content: 'hi', originalLanguage: 'bas-CM' }).success).toBe(true);
      expect(MessageSchemas.edit.safeParse({ content: 'hi', originalLanguage: 'ewo-CM' }).success).toBe(true);
    });

    it('TranslatedAudioSchemas.request accepts a 6-char targetLanguage', () => {
      expect(
        TranslatedAudioSchemas.request.safeParse({ transcriptionId: 'x', targetLanguage: 'bas-CM' }).success
      ).toBe(true);
    });

    it('VoiceModelSchemas.create accepts a 6-char language', () => {
      expect(VoiceModelSchemas.create.safeParse({ name: 'n', language: 'bas-CM' }).success).toBe(true);
    });

    it('AnonymousParticipantSchemas.join accepts a 6-char language', () => {
      expect(AnonymousParticipantSchemas.join.safeParse({ language: 'bas-CM' }).success).toBe(true);
    });

    it('still rejects an over-long (7-char) language code across these schemas', () => {
      expect(MessageSchemas.send.safeParse({ content: 'hi', originalLanguage: 'abcd-CM' }).success).toBe(false);
      expect(VoiceModelSchemas.create.safeParse({ name: 'n', language: 'abcd-CM' }).success).toBe(false);
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

describe('SignalSchemas.encryptedMessage — base64 length invariants', () => {
  // Ground truth of the wire payload (`encryption-utils.encryptContent`): a
  // 12-byte AES-GCM IV and a 16-byte auth tag, BOTH base64-encoded
  // (`uint8ArrayToBase64`). 12 bytes base64 = 16 chars (no padding); 16 bytes
  // base64 = 24 chars (padded). The schema's `iv.length(24)` was a copy of the
  // sibling `authTag.length(24)` constant that forgot the IV is 12 bytes, not
  // 16 — it rejected every real IV the codebase produces.
  const validIv = Buffer.alloc(12).toString('base64'); // 16 chars
  const validAuthTag = Buffer.alloc(16).toString('base64'); // 24 chars

  const base = {
    ciphertext: 'Y2lwaGVydGV4dA==',
    iv: validIv,
    authTag: validAuthTag,
    messageNumber: 0,
  };

  it('accepts a real 12-byte base64 IV (16 chars)', () => {
    expect(validIv.length).toBe(16);
    expect(SignalSchemas.encryptedMessage.safeParse(base).success).toBe(true);
  });

  it('accepts a real 16-byte base64 auth tag (24 chars)', () => {
    expect(validAuthTag.length).toBe(24);
    expect(SignalSchemas.encryptedMessage.safeParse(base).success).toBe(true);
  });

  it('rejects an IV of the wrong byte length (16 bytes → 24 chars)', () => {
    const wrongIv = Buffer.alloc(16).toString('base64'); // 24 chars — a 16-byte IV
    expect(
      SignalSchemas.encryptedMessage.safeParse({ ...base, iv: wrongIv }).success
    ).toBe(false);
  });

  it('rejects an auth tag of the wrong byte length (12 bytes → 16 chars)', () => {
    const wrongTag = Buffer.alloc(12).toString('base64'); // 16 chars — a 12-byte tag
    expect(
      SignalSchemas.encryptedMessage.safeParse({ ...base, authTag: wrongTag }).success
    ).toBe(false);
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

  it('updateUserProfileSchema accepts an empty regionalLanguage (clear secondary language)', () => {
    const result = updateUserProfileSchema.safeParse({ regionalLanguage: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.regionalLanguage).toBe('');
  });

  it('updateUserProfileSchema still rejects an unsupported regionalLanguage code', () => {
    expect(updateUserProfileSchema.safeParse({ regionalLanguage: 'zz' }).success).toBe(false);
  });

  // customDestinationLanguage is the one in-app language field NOT guarded by
  // supportedLanguageCode (which strips region tags and validates support): its
  // schema only lowercased, so a region/script-tagged platform locale ('fr-FR',
  // 'en-US') was persisted verbatim as 'fr-fr' / 'en-us'. That matches no
  // lowercase-keyed MessageTranslation.targetLanguage, forcing the Prisme onto
  // the original message at resolution priority 3 (customDestinationLanguage).
  // Canonicalize via the SSOT normalizeLanguageCode at the write boundary.
  it('updateUserProfileSchema canonicalizes a region-tagged customDestinationLanguage (fr-FR -> fr)', () => {
    const parsed = updateUserProfileSchema.parse({ customDestinationLanguage: 'fr-FR' });
    expect(parsed.customDestinationLanguage).toBe('fr');
  });

  it('updateUserProfileSchema canonicalizes an underscore locale customDestinationLanguage (en_US -> en)', () => {
    const parsed = updateUserProfileSchema.parse({ customDestinationLanguage: 'en_US' });
    expect(parsed.customDestinationLanguage).toBe('en');
  });

  it('updateUserProfileSchema preserves a supported ISO 639-3 customDestinationLanguage (bas)', () => {
    const parsed = updateUserProfileSchema.parse({ customDestinationLanguage: 'bas' });
    expect(parsed.customDestinationLanguage).toBe('bas');
  });

  it('updateUserProfileSchema still clears customDestinationLanguage on empty string / null', () => {
    expect(updateUserProfileSchema.parse({ customDestinationLanguage: '' }).customDestinationLanguage).toBe('');
    expect(updateUserProfileSchema.parse({ customDestinationLanguage: null }).customDestinationLanguage).toBeNull();
  });

  it('UserSchemas.update canonicalizes a region-tagged customDestinationLanguage (en-US -> en)', () => {
    const parsed = UserSchemas.update.parse({ customDestinationLanguage: 'en-US' });
    expect(parsed.customDestinationLanguage).toBe('en');
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

  // Le picker d'onboarding iOS offre toute la base de traduction du SDK
  // (LanguageData.allLanguages) : chaque code proposé doit être accepté à
  // l'inscription, sinon l'utilisateur est bloqué par « Données invalides ».
  it('AuthSchemas.register accepts every language the iOS onboarding picker offers', () => {
    const iosPickerCodes = [
      'sk', 'sl', 'sr', 'ca', 'et', 'lv', 'az', 'kk', 'uz', 'ka', 'ta',
      'ne', 'my', 'km', 'lo', 'tl', 'ff', 'tw', 'ak', 'bm', 'byv', 'fan',
    ];
    for (const code of iosPickerCodes) {
      const result = AuthSchemas.register.safeParse({
        username: 'alice',
        password: 'password123',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        systemLanguage: code,
      });
      expect(result.success, `systemLanguage '${code}' should be accepted`).toBe(true);
    }
  });

  // Le clavier iOS insère l'apostrophe typographique ’ (U+2019) par défaut
  // (smart punctuation) : « N’Diaye » doit passer, comme sa variante ASCII.
  it('AuthSchemas.register accepts names with typographic apostrophes and combining marks', () => {
    const base = {
      username: 'alice',
      password: 'password123',
      email: 'alice@example.com',
    };
    const validNames = [
      { firstName: 'Awa', lastName: 'N’Diaye' },       // apostrophe typographique
      { firstName: 'Awa', lastName: "N'Diaye" },            // apostrophe droite
      { firstName: 'Maʼlik', lastName: 'Diallo' },     // U+02BC modifier letter apostrophe
      { firstName: 'José', lastName: 'García' }, // é décomposé NFD (e + U+0301)
      { firstName: 'Jean-Claude', lastName: 'de la Fontaine' },
    ];
    for (const names of validNames) {
      const result = AuthSchemas.register.safeParse({ ...base, ...names });
      expect(result.success, `${names.firstName} ${names.lastName} should be accepted`).toBe(true);
    }
  });

  it('AuthSchemas.register still rejects names without any letter or with forbidden characters', () => {
    const base = {
      username: 'alice',
      password: 'password123',
      email: 'alice@example.com',
      lastName: 'Smith',
    };
    for (const firstName of ['123', '...', 'Alice!', 'Alice@']) {
      const result = AuthSchemas.register.safeParse({ ...base, firstName });
      expect(result.success, `firstName '${firstName}' should be rejected`).toBe(false);
    }
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

describe('NotificationPreferenceSchemas.update — DND time format', () => {
  // The DND window is evaluated with a lexicographic "HH:MM" comparison in
  // isWithinDnd, which only holds for zero-padded hours. This schema is a write
  // boundary, so it must reject a single-digit hour ("9:00") rather than let it
  // reach persistence — converging on the canonical /^([01]\d|2[0-3]):([0-5]\d)$/
  // already enforced by the gateway (notification-schemas.ts, isValidDndTime) and
  // the shared NotificationPreferenceSchema default schema.
  it('rejects a single-digit start hour', () => {
    const result = NotificationPreferenceSchemas.update.safeParse({ dndStartTime: '9:00' });
    expect(result.success).toBe(false);
  });

  it('rejects a single-digit end hour', () => {
    const result = NotificationPreferenceSchemas.update.safeParse({ dndEndTime: '8:30' });
    expect(result.success).toBe(false);
  });

  it('accepts zero-padded 24h times', () => {
    const result = NotificationPreferenceSchemas.update.safeParse({
      dndStartTime: '09:00',
      dndEndTime: '23:59',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an out-of-range hour', () => {
    expect(NotificationPreferenceSchemas.update.safeParse({ dndStartTime: '24:00' }).success).toBe(false);
  });
});

// ─── `ano_` n'est PAS réservé côté comptes ───────────────────────────────────
//
// Le préfixe `ano_` marque les participants sans compte
// (`utils/anonymous-username.ts`), mais il ne leur est pas RÉSERVÉ : un compte
// peut parfaitement s'appeler `ano_bob`. Ce qui distingue les deux populations
// n'est pas le nom, c'est le GLYPHE FANTÔME que seuls les participants sans
// compte portent, partout où leur nom et leur pseudo s'affichent.
//
// Interdire le préfixe aux comptes aurait déplacé le problème plutôt que de le
// résoudre : un refus d'inscription pour un motif que l'utilisateur ne peut
// pas deviner, au bénéfice d'une désambiguïsation que le glyphe assure déjà.

describe('`ano_` reste ouvert aux pseudos de compte', () => {
  const registerPayload = (username: string) => ({
    username,
    password: 'SecurePass123!',
    firstName: 'Bob',
    lastName: 'Smith',
    email: 'bob@example.com',
  });

  it('l’inscription accepte un pseudo préfixé `ano_`', () => {
    expect(AuthSchemas.register.safeParse(registerPayload('ano_bob')).success).toBe(true);
  });

  it('le changement de pseudo l’accepte aussi', () => {
    const result = updateUsernameSchema.safeParse({
      newUsername: 'ano_bob',
      currentPassword: 'SecurePass123!',
    });
    expect(result.success).toBe(true);
  });

  it('le schéma commun l’accepte aussi', () => {
    expect(CommonSchemas.username.safeParse('ano_bobby').success).toBe(true);
  });
});
