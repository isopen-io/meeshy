/**
 * Tests for Conversation Helper Utilities
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveUserLanguage,
  resolveUserLanguagesOrdered,
  generateConversationIdentifier,
  isValidMongoId,
  canEditMessage,
  generateDefaultConversationTitle,
  getRequiredLanguages,
} from '../utils/conversation-helpers';

describe('resolveUserLanguage', () => {
  it('should return systemLanguage over customDestinationLanguage', () => {
    const user = {
      customDestinationLanguage: 'de',
      systemLanguage: 'en',
    };
    expect(resolveUserLanguage(user)).toBe('en');
  });

  it('should return customDestinationLanguage when no systemLanguage or regionalLanguage', () => {
    const user = {
      customDestinationLanguage: 'de',
    };
    expect(resolveUserLanguage(user)).toBe('de');
  });

  it('should return system language when no custom destination', () => {
    const user = {
      systemLanguage: 'en',
      regionalLanguage: 'es',
    };
    expect(resolveUserLanguage(user)).toBe('en');
  });

  it('should fallback to system language when only system set', () => {
    const user = {
      systemLanguage: 'en',
    };
    expect(resolveUserLanguage(user)).toBe('en');
  });

  it('should fallback to fr when no language set', () => {
    const user = {};
    expect(resolveUserLanguage(user)).toBe('fr');
  });

  it('should fallback to system language when customDestinationLanguage is undefined', () => {
    const user = {
      customDestinationLanguage: undefined,
      systemLanguage: 'en',
    };
    expect(resolveUserLanguage(user)).toBe('en');
  });

  // F62 — case parity with resolveUserLanguagesOrdered. Prefs pass validation
  // case-insensitively (isSupportedLanguage lowercases) but persist verbatim, so
  // a stored 'EN' would otherwise miss the lowercase-keyed translations produced
  // by resolveUserLanguagesOrdered → client shows original instead of translation.
  it('should lowercase an uppercase systemLanguage', () => {
    expect(resolveUserLanguage({ systemLanguage: 'EN' })).toBe('en');
  });

  it('should lowercase an uppercase regionalLanguage', () => {
    expect(resolveUserLanguage({ regionalLanguage: 'ES' })).toBe('es');
  });

  it('should lowercase a mixed-case customDestinationLanguage', () => {
    expect(resolveUserLanguage({ customDestinationLanguage: 'De' })).toBe('de');
  });

  // In-app prefs persist verbatim (`z.string().optional()`, no normalization on
  // write), so a BCP-47 value like 'pt-BR' or 'en-US' — which the web
  // Accept-Language / iOS locale paths can produce — reaches the resolver. A
  // bare `.toLowerCase()` yields 'pt-br'/'en-us', which never matches the
  // lowercase 2-letter translation keys ('pt'/'en') → Prisme violation. In-app
  // tiers MUST normalize identically to the deviceLocale tier.
  it('should normalize a BCP-47 systemLanguage (pt-BR → pt)', () => {
    expect(resolveUserLanguage({ systemLanguage: 'pt-BR' })).toBe('pt');
  });

  it('should normalize a BCP-47 regionalLanguage (en-US → en)', () => {
    expect(resolveUserLanguage({ regionalLanguage: 'en-US' })).toBe('en');
  });

  it('should normalize an underscore-form customDestinationLanguage (fr_FR → fr)', () => {
    expect(resolveUserLanguage({ customDestinationLanguage: 'fr_FR' })).toBe('fr');
  });

  it('resolves a BCP-47 in-app pref identically to the same value as deviceLocale', () => {
    expect(resolveUserLanguage({ systemLanguage: 'pt-BR' })).toBe(
      resolveUserLanguage({}, { deviceLocale: 'pt-BR' })
    );
  });

  // Zero-regression guard: a value normalizeLanguageCode cannot canonicalize
  // (unknown irreducible ISO 639-3) must still fall back to lowercase, exactly
  // as before — never dropped to the next tier.
  it('should preserve an unnormalizable in-app pref via lowercase fallback', () => {
    expect(resolveUserLanguage({ systemLanguage: 'ZZZ' })).toBe('zzz');
  });
});

describe('generateConversationIdentifier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T10:30:45Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate identifier with sanitized title', () => {
    const identifier = generateConversationIdentifier('My Group Chat');
    expect(identifier).toBe('mshy_my-group-chat-20240315103045');
  });

  it('should remove special characters from title', () => {
    // Special characters removed, multiple dashes collapsed to one
    const identifier = generateConversationIdentifier('Test @#$% Group!');
    expect(identifier).toBe('mshy_test-group-20240315103045');
  });

  it('should handle title with only special characters', () => {
    const identifier = generateConversationIdentifier('!@#$%');
    expect(identifier).toMatch(/^mshy_[a-z0-9]+-20240315103045$/);
  });

  it('should generate random identifier without title', () => {
    const identifier = generateConversationIdentifier();
    expect(identifier).toMatch(/^mshy_[a-z0-9]+-20240315103045$/);
  });

  it('should generate random identifier with empty title', () => {
    const identifier = generateConversationIdentifier('');
    expect(identifier).toMatch(/^mshy_[a-z0-9]+-20240315103045$/);
  });

  it('should convert title to lowercase', () => {
    const identifier = generateConversationIdentifier('UPPERCASE');
    expect(identifier).toBe('mshy_uppercase-20240315103045');
  });

  it('should collapse multiple dashes', () => {
    const identifier = generateConversationIdentifier('test---multiple---dashes');
    expect(identifier).toBe('mshy_test-multiple-dashes-20240315103045');
  });

  it('should normalize French accents', () => {
    const identifier = generateConversationIdentifier('Café résumé');
    expect(identifier).toBe('mshy_cafe-resume-20240315103045');
  });

  it('should normalize various accented characters', () => {
    // German umlauts: ä→ae, ü→ue, then NFD for others
    // àâ→aa, ä→ae, éèêë→eeee, ïî→ii, ô→o, ùû→uu, ü→ue, ç→c
    const identifier = generateConversationIdentifier('àâäéèêëïîôùûüç');
    expect(identifier).toBe('mshy_aaaeeeeeiiouuuec-20240315103045');
  });

  it('should handle mixed accents and special characters', () => {
    const identifier = generateConversationIdentifier('Réunion équipe été 2024!');
    expect(identifier).toBe('mshy_reunion-equipe-ete-2024-20240315103045');
  });

  it('should handle German umlauts with proper transliteration', () => {
    // ö→oe, ü→ue, ä→ae, ß→ss
    const identifier = generateConversationIdentifier('Größe über');
    expect(identifier).toBe('mshy_groesse-ueber-20240315103045');
  });

  it('should handle all German special characters', () => {
    const identifier = generateConversationIdentifier('Öffentliche Äußerung');
    expect(identifier).toBe('mshy_oeffentliche-aeusserung-20240315103045');
  });

  it('should handle Spanish characters', () => {
    const identifier = generateConversationIdentifier('Niño año');
    expect(identifier).toBe('mshy_nino-ano-20240315103045');
  });

  it('transliterates German umlauts identically for NFD-decomposed input', () => {
    // A title may reach the resolver already in NFD (decomposed) form — e.g.
    // pasted from a macOS filename, where 'ö' is 'o' + U+0308 rather than the
    // precomposed U+00F6. The German transliteration contract (ö→oe, ü→ue,
    // ä→ae) MUST hold regardless of the input's Unicode normalization form,
    // otherwise the same visible title produces two divergent identifiers.
    const nfc = 'Größe über';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc); // guard: the two strings are byte-distinct
    expect(generateConversationIdentifier(nfd)).toBe('mshy_groesse-ueber-20240315103045');
    expect(generateConversationIdentifier(nfd)).toBe(generateConversationIdentifier(nfc));
  });
});

describe('isValidMongoId', () => {
  it('should return true for valid MongoDB ObjectId', () => {
    expect(isValidMongoId('507f1f77bcf86cd799439011')).toBe(true);
    expect(isValidMongoId('000000000000000000000000')).toBe(true);
    expect(isValidMongoId('ffffffffffffffffffffffff')).toBe(true);
    expect(isValidMongoId('ABCDEF123456789012345678')).toBe(true);
  });

  it('should return false for invalid ObjectId', () => {
    expect(isValidMongoId('')).toBe(false);
    expect(isValidMongoId('123')).toBe(false);
    expect(isValidMongoId('507f1f77bcf86cd79943901')).toBe(false); // 23 chars
    expect(isValidMongoId('507f1f77bcf86cd7994390111')).toBe(false); // 25 chars
    expect(isValidMongoId('507f1f77bcf86cd79943901g')).toBe(false); // invalid char
    expect(isValidMongoId('not-a-mongo-id')).toBe(false);
  });
});

describe('canEditMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow editing for admins regardless of time', () => {
    const oldMessage = new Date('2024-03-14T12:00:00Z'); // 24 hours ago
    expect(canEditMessage(oldMessage, 'ADMIN')).toEqual({ canEdit: true });
    expect(canEditMessage(oldMessage, 'BIGBOSS')).toEqual({ canEdit: true });
    expect(canEditMessage(oldMessage, 'MODERATOR')).toEqual({ canEdit: true });
    expect(canEditMessage(oldMessage, 'CREATOR')).toEqual({ canEdit: true });
  });

  it('should allow editing recent messages for regular users', () => {
    const recentMessage = new Date('2024-03-15T11:30:00Z'); // 30 minutes ago
    expect(canEditMessage(recentMessage, 'USER')).toEqual({ canEdit: true });
  });

  it('should deny editing old messages for regular users', () => {
    const oldMessage = new Date('2024-03-15T10:30:00Z'); // 1.5 hours ago
    expect(canEditMessage(oldMessage, 'USER')).toEqual({
      canEdit: false,
      reason: 'MESSAGE_TOO_OLD',
    });
  });

  it('should handle string date format', () => {
    const recentMessage = '2024-03-15T11:30:00Z';
    expect(canEditMessage(recentMessage, 'USER')).toEqual({ canEdit: true });
  });

  it('should default to USER role', () => {
    const oldMessage = new Date('2024-03-15T10:30:00Z'); // 1.5 hours ago
    expect(canEditMessage(oldMessage)).toEqual({
      canEdit: false,
      reason: 'MESSAGE_TOO_OLD',
    });
  });

  it('should allow editing exactly at 1 hour boundary', () => {
    const exactlyOneHour = new Date('2024-03-15T11:00:00Z');
    expect(canEditMessage(exactlyOneHour, 'USER')).toEqual({ canEdit: true });
  });

  it('should deny editing just past 1 hour', () => {
    const justPastOneHour = new Date('2024-03-15T10:59:59Z');
    expect(canEditMessage(justPastOneHour, 'USER')).toEqual({
      canEdit: false,
      reason: 'MESSAGE_TOO_OLD',
    });
  });
});

describe('generateDefaultConversationTitle', () => {
  it('should return "Conversation" for no other members', () => {
    const members = [{ id: 'user1', username: 'currentUser' }];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Conversation');
  });

  it('should return single member displayName', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', displayName: 'John Doe', username: 'johndoe' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('John Doe');
  });

  it('should fallback to username if no displayName', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', username: 'johndoe' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('johndoe');
  });

  it('should fallback to firstName + lastName', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', firstName: 'John', lastName: 'Doe' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('John Doe');
  });

  it('should return "Unknown User" for member with no info', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Unknown User');
  });

  it('should join two member names', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', displayName: 'Alice' },
      { id: 'user3', displayName: 'Bob' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Alice, Bob');
  });

  it('should show first two names and count for 3+ members', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', displayName: 'Alice' },
      { id: 'user3', displayName: 'Bob' },
      { id: 'user4', displayName: 'Charlie' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Alice, Bob and 1 other(s)');
  });

  it('should handle 4+ members correctly', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', displayName: 'Alice' },
      { id: 'user3', displayName: 'Bob' },
      { id: 'user4', displayName: 'Charlie' },
      { id: 'user5', displayName: 'Diana' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Alice, Bob and 2 other(s)');
  });

  it('should handle members with only firstName for multiple members', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', firstName: 'Alice' },
      { id: 'user3', firstName: 'Bob' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Alice, Bob');
  });
});

describe('getRequiredLanguages', () => {
  it('should return unique languages from all members', () => {
    const members = [
      { systemLanguage: 'en' },
      { systemLanguage: 'fr' },
      { systemLanguage: 'de' },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toHaveLength(3);
    expect(languages).toContain('en');
    expect(languages).toContain('fr');
    expect(languages).toContain('de');
  });

  it('should deduplicate languages', () => {
    const members = [
      { systemLanguage: 'en' },
      { systemLanguage: 'en' },
      { systemLanguage: 'fr' },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toHaveLength(2);
    expect(languages).toContain('en');
    expect(languages).toContain('fr');
  });

  it('should respect user language preferences (systemLanguage prioritaire)', () => {
    const members = [
      { systemLanguage: 'en', customDestinationLanguage: 'de' },
      { systemLanguage: 'es' },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toContain('en');
    expect(languages).toContain('es');
  });

  it('should use customDestinationLanguage when no systemLanguage', () => {
    const members = [
      { customDestinationLanguage: 'de' },
      { systemLanguage: 'es' },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toContain('de');
    expect(languages).toContain('es');
  });

  it('should return empty array for no members', () => {
    expect(getRequiredLanguages([])).toEqual([]);
  });

  it('should fallback to fr for members with no language set', () => {
    const members = [{}];
    const languages = getRequiredLanguages(members);
    expect(languages).toContain('fr');
  });

  it('should include deviceLocale when no in-app pref is set on the member', () => {
    const members = [
      { deviceLocale: 'it' },
      { systemLanguage: 'fr' },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toContain('it');
    expect(languages).toContain('fr');
  });

  it('should not let deviceLocale shadow systemLanguage on the same member', () => {
    const members = [
      { systemLanguage: 'fr', deviceLocale: 'it' },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toEqual(['fr']);
  });

  // F62 — a member stored 'EN' and another stored 'en' are the SAME translation
  // destination; without case parity they inflate the target set with a duplicate
  // ('EN' never matches a lowercase-keyed translation → wasted translation request).
  it('should deduplicate members that differ only by pref casing', () => {
    const members = [
      { systemLanguage: 'EN' },
      { systemLanguage: 'en' },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toEqual(['en']);
  });
});

describe('resolveUserLanguage with deviceLocale (4th priority)', () => {
  it('returns systemLanguage when set, ignoring deviceLocale', () => {
    expect(
      resolveUserLanguage(
        { systemLanguage: 'fr' },
        { deviceLocale: 'it' }
      )
    ).toBe('fr');
  });

  it('returns regionalLanguage when system is missing, ignoring deviceLocale', () => {
    expect(
      resolveUserLanguage(
        { regionalLanguage: 'es' },
        { deviceLocale: 'it' }
      )
    ).toBe('es');
  });

  it('returns customDestinationLanguage when system+regional are missing, ignoring deviceLocale', () => {
    expect(
      resolveUserLanguage(
        { customDestinationLanguage: 'pt' },
        { deviceLocale: 'it' }
      )
    ).toBe('pt');
  });

  it('returns deviceLocale when all 3 in-app prefs are unset', () => {
    expect(
      resolveUserLanguage({}, { deviceLocale: 'it-IT' })
    ).toBe('it');
  });

  it('normalizes deviceLocale (zh-Hant-HK → zh)', () => {
    expect(
      resolveUserLanguage({}, { deviceLocale: 'zh-Hant-HK' })
    ).toBe('zh');
  });

  it('normalizes underscore form (fr_FR → fr)', () => {
    expect(
      resolveUserLanguage({}, { deviceLocale: 'fr_FR' })
    ).toBe('fr');
  });

  it('falls back to fr when deviceLocale is malformed', () => {
    expect(
      resolveUserLanguage({}, { deviceLocale: '@@@' })
    ).toBe('fr');
  });

  it('falls back to fr when nothing is set', () => {
    expect(resolveUserLanguage({})).toBe('fr');
  });

  it('backward compat: single-argument call still works', () => {
    expect(resolveUserLanguage({ systemLanguage: 'es' })).toBe('es');
  });
});

describe('resolveUserLanguagesOrdered', () => {
  it('returns 4-level priority list when all set and distinct', () => {
    expect(
      resolveUserLanguagesOrdered(
        {
          systemLanguage: 'fr',
          regionalLanguage: 'es',
          customDestinationLanguage: 'pt',
        },
        { deviceLocale: 'it' }
      )
    ).toEqual(['fr', 'es', 'pt', 'it']);
  });

  it('preserves order even when in-app prefs are mixed-case', () => {
    expect(
      resolveUserLanguagesOrdered(
        { systemLanguage: 'FR', regionalLanguage: 'Es' },
        { deviceLocale: 'IT' }
      )
    ).toEqual(['fr', 'es', 'it']);
  });

  it('dedupes when deviceLocale matches an in-app pref', () => {
    expect(
      resolveUserLanguagesOrdered(
        { systemLanguage: 'fr' },
        { deviceLocale: 'fr-FR' }
      )
    ).toEqual(['fr']);
  });

  it('normalizes deviceLocale before deduping', () => {
    expect(
      resolveUserLanguagesOrdered(
        { systemLanguage: 'zh' },
        { deviceLocale: 'zh-Hant-HK' }
      )
    ).toEqual(['zh']);
  });

  it('omits deviceLocale when invalid', () => {
    expect(
      resolveUserLanguagesOrdered(
        { systemLanguage: 'fr' },
        { deviceLocale: '@@@' }
      )
    ).toEqual(['fr']);
  });

  it('omits deviceLocale when not provided in opts', () => {
    expect(
      resolveUserLanguagesOrdered({ systemLanguage: 'fr', regionalLanguage: 'es' })
    ).toEqual(['fr', 'es']);
  });

  it('returns empty array when nothing is set (caller decides fallback)', () => {
    expect(resolveUserLanguagesOrdered({})).toEqual([]);
  });

  it('handles deviceLocale-only when no in-app prefs set', () => {
    expect(
      resolveUserLanguagesOrdered({}, { deviceLocale: 'ja' })
    ).toEqual(['ja']);
  });
});

describe('canEditMessage — role case insensitivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const oldMessage = new Date('2024-03-14T12:00:00Z');

  it('allows admin with lowercase role (DB may store lowercase)', () => {
    expect(canEditMessage(oldMessage, 'admin')).toEqual({ canEdit: true });
  });

  it('allows moderator with lowercase role', () => {
    expect(canEditMessage(oldMessage, 'moderator')).toEqual({ canEdit: true });
  });

  it('allows bigboss with mixed-case role', () => {
    expect(canEditMessage(oldMessage, 'BigBoss')).toEqual({ canEdit: true });
  });

  it('allows creator with lowercase role', () => {
    expect(canEditMessage(oldMessage, 'creator')).toEqual({ canEdit: true });
  });
});

describe('generateDefaultConversationTitle — name edge cases', () => {
  it('builds fullName from firstName only without trailing space', () => {
    const members = [
      { id: 'me' },
      { id: 'other', firstName: 'John' },
    ];
    const result = generateDefaultConversationTitle(members as any, 'me');
    expect(result).toBe('John');
    expect(result.endsWith(' ')).toBe(false);
  });

  it('builds fullName from lastName only without leading space', () => {
    const members = [
      { id: 'me' },
      { id: 'other', lastName: 'Doe' },
    ];
    const result = generateDefaultConversationTitle(members as any, 'me');
    expect(result).toBe('Doe');
    expect(result.startsWith(' ')).toBe(false);
  });

  it('2-member: uses lastName when no displayName or username', () => {
    const members = [
      { id: 'me' },
      { id: 'a', lastName: 'Smith' },
      { id: 'b', firstName: 'Alice' },
    ];
    const result = generateDefaultConversationTitle(members as any, 'me');
    expect(result).toBe('Smith, Alice');
  });

  it('2-member: combines firstName and lastName when no displayName or username', () => {
    const members = [
      { id: 'me' },
      { id: 'a', firstName: 'John', lastName: 'Smith' },
      { id: 'b', firstName: 'Alice', lastName: 'Jones' },
    ];
    const result = generateDefaultConversationTitle(members as any, 'me');
    expect(result).toBe('John Smith, Alice Jones');
  });

  it('3+ member: uses lastName fallback for display name', () => {
    const members = [
      { id: 'me' },
      { id: 'a', lastName: 'Smith' },
      { id: 'b', firstName: 'Alice' },
      { id: 'c', username: 'charlie' },
    ];
    const result = generateDefaultConversationTitle(members as any, 'me');
    expect(result).toBe('Smith, Alice and 1 other(s)');
  });
});
