/**
 * Tests for utils/user-language-preferences.ts
 */

jest.mock('@meeshy/shared/utils/languages', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
  ],
}));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  resolveUserLanguage: (user: any, opts: any) => {
    return user.systemLanguage || opts?.deviceLocale || 'fr';
  },
}));

jest.mock('@/lib/device-locale', () => ({
  getDeviceLocale: jest.fn(() => null),
}));

import {
  getUserLanguageChoices,
  resolveUserPreferredLanguage,
  getUserLanguagePreferences,
  getRequiredLanguagesForConversation,
} from '@/utils/user-language-preferences';

const makeUser = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'u-1',
    username: 'alice',
    systemLanguage: 'fr',
    ...overrides,
  } as any);

// ─── getUserLanguageChoices ───────────────────────────────────────────────────

describe('getUserLanguageChoices', () => {
  it('always includes systemLanguage as the first choice', () => {
    const choices = getUserLanguageChoices(makeUser({ systemLanguage: 'fr' }));
    expect(choices[0].code).toBe('fr');
    expect(choices[0].isDefault).toBe(true);
  });

  it('looks up the flag from SUPPORTED_LANGUAGES', () => {
    const choices = getUserLanguageChoices(makeUser({ systemLanguage: 'en' }));
    expect(choices[0].flag).toBe('🇬🇧');
  });

  it('uses fallback flag when language not in SUPPORTED_LANGUAGES', () => {
    const choices = getUserLanguageChoices(makeUser({ systemLanguage: 'zh' }));
    expect(typeof choices[0].flag).toBe('string');
  });

  it('includes regionalLanguage when different from systemLanguage', () => {
    const choices = getUserLanguageChoices(makeUser({ systemLanguage: 'fr', regionalLanguage: 'en' }));
    expect(choices).toHaveLength(2);
    expect(choices[1].code).toBe('en');
    expect(choices[1].isDefault).toBe(false);
  });

  it('does not include regionalLanguage when it equals systemLanguage', () => {
    const choices = getUserLanguageChoices(makeUser({ systemLanguage: 'fr', regionalLanguage: 'fr' }));
    expect(choices).toHaveLength(1);
  });

  it('includes customDestinationLanguage when unique', () => {
    const choices = getUserLanguageChoices(makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'es',
    }));
    expect(choices).toHaveLength(3);
    expect(choices[2].code).toBe('es');
  });

  it('excludes customDestinationLanguage when it duplicates systemLanguage', () => {
    const choices = getUserLanguageChoices(makeUser({
      systemLanguage: 'fr',
      customDestinationLanguage: 'fr',
    }));
    expect(choices).toHaveLength(1);
  });
});

// ─── resolveUserPreferredLanguage ────────────────────────────────────────────

describe('resolveUserPreferredLanguage', () => {
  it('returns the systemLanguage via resolveUserLanguage', () => {
    const lang = resolveUserPreferredLanguage(makeUser({ systemLanguage: 'en' }));
    expect(lang).toBe('en');
  });

  it('prefers persisted deviceLocale over navigator.language when systemLanguage absent', () => {
    const lang = resolveUserPreferredLanguage(makeUser({ systemLanguage: undefined, deviceLocale: 'es' }));
    // resolveUserLanguage mock: systemLanguage || deviceLocale || 'fr'
    expect(lang).toBe('es');
  });
});

// ─── getUserLanguagePreferences ───────────────────────────────────────────────

describe('getUserLanguagePreferences', () => {
  it('returns an array with systemLanguage', () => {
    const langs = getUserLanguagePreferences(makeUser({ systemLanguage: 'fr' }));
    expect(langs).toContain('fr');
  });

  it('includes regionalLanguage when different', () => {
    const langs = getUserLanguagePreferences(makeUser({ systemLanguage: 'fr', regionalLanguage: 'en' }));
    expect(langs).toContain('en');
    expect(langs).toHaveLength(2);
  });

  it('does not include duplicates', () => {
    const langs = getUserLanguagePreferences(makeUser({ systemLanguage: 'fr', regionalLanguage: 'fr' }));
    expect(langs).toHaveLength(1);
  });

  it('includes customDestinationLanguage when unique', () => {
    const langs = getUserLanguagePreferences(makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'es',
    }));
    expect(langs).toHaveLength(3);
  });

  it('returns empty array when no languages set', () => {
    const langs = getUserLanguagePreferences(makeUser({ systemLanguage: undefined }));
    expect(langs).toHaveLength(0);
  });
});

// ─── getRequiredLanguagesForConversation ─────────────────────────────────────

describe('getRequiredLanguagesForConversation', () => {
  it('returns empty array for empty users list', () => {
    expect(getRequiredLanguagesForConversation([])).toHaveLength(0);
  });

  it('returns the language for a single user', () => {
    const langs = getRequiredLanguagesForConversation([makeUser({ systemLanguage: 'fr' })]);
    expect(langs).toContain('fr');
  });

  it('deduplicates languages across users', () => {
    const users = [
      makeUser({ systemLanguage: 'fr' }),
      makeUser({ systemLanguage: 'fr' }),
    ];
    const langs = getRequiredLanguagesForConversation(users);
    expect(langs).toHaveLength(1);
  });

  it('returns multiple languages for multi-language conversation', () => {
    const users = [
      makeUser({ systemLanguage: 'fr' }),
      makeUser({ systemLanguage: 'en' }),
    ];
    const langs = getRequiredLanguagesForConversation(users);
    expect(langs).toHaveLength(2);
    expect(langs).toContain('fr');
    expect(langs).toContain('en');
  });
});
