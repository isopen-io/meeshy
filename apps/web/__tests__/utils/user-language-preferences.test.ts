jest.mock('@meeshy/shared/utils/languages', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'fr', name: 'French', flag: 'FR' },
    { code: 'en', name: 'English', flag: 'GB' },
    { code: 'es', name: 'Spanish', flag: 'ES' },
    { code: 'de', name: 'German', flag: 'DE' },
  ],
}));

const mockGetDeviceLocale = jest.fn();

jest.mock('@/lib/device-locale', () => ({
  getDeviceLocale: (...args: any[]) => mockGetDeviceLocale(...args),
}));

import {
  getUserLanguageChoices,
  resolveUserPreferredLanguage,
  getUserLanguagePreferences,
  getRequiredLanguagesForConversation,
} from '@/utils/user-language-preferences';
import type { User } from '@/types';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'USER',
    isOnline: false,
    lastActiveAt: new Date(),
    systemLanguage: 'fr',
    regionalLanguage: '',
    autoTranslateEnabled: false,
    isActive: true,
    ...overrides,
  } as unknown as User;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDeviceLocale.mockReturnValue(null);
});

describe('getUserLanguageChoices', () => {
  describe('system language entry (always present)', () => {
    it('uses systemLanguage when defined and finds it in SUPPORTED_LANGUAGES', () => {
      const user = makeUser({ systemLanguage: 'fr' });
      const choices = getUserLanguageChoices(user);

      expect(choices[0].code).toBe('fr');
      expect(choices[0].name).toBe('Langue système');
      expect(choices[0].description).toBe('French');
      expect(choices[0].isDefault).toBe(true);
    });

    it('falls back to fr code and Francais when systemLanguage is null/undefined', () => {
      const user = makeUser({ systemLanguage: undefined as unknown as string });
      const choices = getUserLanguageChoices(user);

      expect(choices[0].code).toBe('fr');
      expect(choices[0].description).toBe('Français');
    });

    it('falls back to Francais description when language not found in SUPPORTED_LANGUAGES', () => {
      const user = makeUser({ systemLanguage: 'xx' });
      const choices = getUserLanguageChoices(user);

      expect(choices[0].code).toBe('xx');
      expect(choices[0].description).toBe('Français');
    });
  });

  describe('regional language entry', () => {
    it('adds regional language when defined and different from system', () => {
      const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'en' });
      const choices = getUserLanguageChoices(user);

      expect(choices).toHaveLength(2);
      expect(choices[1].code).toBe('en');
      expect(choices[1].name).toBe('Langue régionale');
      expect(choices[1].description).toBe('English');
      expect(choices[1].isDefault).toBe(false);
    });

    it('omits regional language when same as system language', () => {
      const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'fr' });
      expect(getUserLanguageChoices(user)).toHaveLength(1);
    });

    it('omits regional language when empty string', () => {
      const user = makeUser({ systemLanguage: 'fr', regionalLanguage: '' });
      expect(getUserLanguageChoices(user)).toHaveLength(1);
    });

    it('falls back to language code as description when regional not in SUPPORTED_LANGUAGES', () => {
      const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'xx' });
      const choices = getUserLanguageChoices(user);

      expect(choices[1].description).toBe('xx');
    });
  });

  describe('custom destination language entry', () => {
    it('adds custom language when different from both system and regional', () => {
      const user = makeUser({
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        customDestinationLanguage: 'de',
      });
      const choices = getUserLanguageChoices(user);

      expect(choices).toHaveLength(3);
      expect(choices[2].code).toBe('de');
      expect(choices[2].name).toBe('Langue personnalisée');
      expect(choices[2].description).toBe('German');
      expect(choices[2].isDefault).toBe(false);
    });

    it('omits custom language when same as system language', () => {
      const user = makeUser({
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        customDestinationLanguage: 'fr',
      });
      expect(getUserLanguageChoices(user)).toHaveLength(2);
    });

    it('omits custom language when same as regional language', () => {
      const user = makeUser({
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        customDestinationLanguage: 'en',
      });
      expect(getUserLanguageChoices(user)).toHaveLength(2);
    });

    it('omits custom language when undefined', () => {
      const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'en' });
      expect(getUserLanguageChoices(user)).toHaveLength(2);
    });

    it('falls back to language code as description when custom not in SUPPORTED_LANGUAGES', () => {
      const user = makeUser({
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        customDestinationLanguage: 'zz',
      });
      const choices = getUserLanguageChoices(user);

      expect(choices[2].description).toBe('zz');
    });

    it('includes custom language when no regional is set', () => {
      const user = makeUser({
        systemLanguage: 'fr',
        regionalLanguage: '',
        customDestinationLanguage: 'es',
      });
      const choices = getUserLanguageChoices(user);

      expect(choices).toHaveLength(2);
      expect(choices[1].code).toBe('es');
    });
  });

  describe('case-insensitive catalog lookup', () => {
    it('resolves an uppercase stored code identically to its lowercase form (emits lowercase)', () => {
      const upper = getUserLanguageChoices(makeUser({ systemLanguage: 'EN' }))[0];
      const lower = getUserLanguageChoices(makeUser({ systemLanguage: 'en' }))[0];

      // 'EN' must resolve the same catalog entry as 'en' (no 🇫🇷 fallback) and emit lowercase.
      expect(upper.code).toBe('en');
      expect(upper.description).toBe(lower.description);
      expect(upper.flag).toBe(lower.flag);
    });

    it('collapses a regional entry that differs from system only by case', () => {
      const user = makeUser({ systemLanguage: 'en', regionalLanguage: 'EN' });
      expect(getUserLanguageChoices(user)).toHaveLength(1);
    });
  });
});

describe('resolveUserPreferredLanguage', () => {
  it('returns systemLanguage when set (highest priority)', () => {
    const user = makeUser({ systemLanguage: 'fr' });
    expect(resolveUserPreferredLanguage(user)).toBe('fr');
  });

  it('falls back to fr when no preferences configured', () => {
    const user = makeUser({
      systemLanguage: undefined as unknown as string,
      regionalLanguage: '',
    });
    expect(resolveUserPreferredLanguage(user)).toBe('fr');
  });

  it('returns regionalLanguage when systemLanguage is not set', () => {
    const user = makeUser({
      systemLanguage: undefined as unknown as string,
      regionalLanguage: 'en',
    });
    expect(resolveUserPreferredLanguage(user)).toBe('en');
  });

  it('uses persisted deviceLocale from user.deviceLocale when system/regional/custom not set', () => {
    const user = {
      ...makeUser({
        systemLanguage: undefined as unknown as string,
        regionalLanguage: '',
      }),
      deviceLocale: 'de',
    } as unknown as User;

    const result = resolveUserPreferredLanguage(user);
    expect(result).toBe('de');
  });

  it('falls back to getDeviceLocale when user.deviceLocale is null and system not set', () => {
    const user = {
      ...makeUser({
        systemLanguage: undefined as unknown as string,
        regionalLanguage: '',
      }),
      deviceLocale: null,
    } as unknown as User;
    mockGetDeviceLocale.mockReturnValue('pt');

    const result = resolveUserPreferredLanguage(user);
    expect(result).toBe('pt');
  });

  it('uses getDeviceLocale when no persisted deviceLocale exists', () => {
    const user = makeUser({
      systemLanguage: undefined as unknown as string,
      regionalLanguage: '',
    });
    mockGetDeviceLocale.mockReturnValue('es');

    const result = resolveUserPreferredLanguage(user);
    expect(result).toBe('es');
  });

  it('prefers systemLanguage over deviceLocale', () => {
    const user = {
      ...makeUser({ systemLanguage: 'fr' }),
      deviceLocale: 'en',
    } as unknown as User;

    const result = resolveUserPreferredLanguage(user);
    expect(result).toBe('fr');
  });
});

describe('getUserLanguagePreferences', () => {
  it('returns only systemLanguage when no regional or custom defined', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: '' });
    expect(getUserLanguagePreferences(user)).toEqual(['fr']);
  });

  it('returns empty array when no systemLanguage defined', () => {
    const user = makeUser({ systemLanguage: undefined as unknown as string, regionalLanguage: '' });
    expect(getUserLanguagePreferences(user)).toEqual([]);
  });

  it('includes regional language when different from system', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'en' });
    expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en']);
  });

  it('deduplicates regional language when same as system', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'fr' });
    expect(getUserLanguagePreferences(user)).toEqual(['fr']);
  });

  it('includes custom destination language when unique', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'de',
    });
    expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en', 'de']);
  });

  it('excludes custom destination language when same as system', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'fr',
    });
    expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en']);
  });

  it('excludes custom destination language when same as regional', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'en',
    });
    expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en']);
  });

  it('excludes empty customDestinationLanguage', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: '',
    });
    expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en']);
  });

  it('lowercases and deduplicates codes that differ only by case', () => {
    const user = makeUser({ systemLanguage: 'EN', regionalLanguage: 'en' });
    expect(getUserLanguagePreferences(user)).toEqual(['en']);
  });

  describe('deviceLocale as 4th priority (Prisme étendu)', () => {
    it('appends persisted deviceLocale after in-app preferences', () => {
      const user = makeUser({
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        deviceLocale: 'it',
      } as Partial<User>);
      expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en', 'it']);
    });

    it('falls back to navigator.language when deviceLocale is not persisted', () => {
      mockGetDeviceLocale.mockReturnValue('pt-BR');
      const user = makeUser({ systemLanguage: 'fr', regionalLanguage: '' });
      expect(getUserLanguagePreferences(user)).toEqual(['fr', 'pt']);
    });

    it('prefers persisted deviceLocale over navigator.language', () => {
      mockGetDeviceLocale.mockReturnValue('es-ES');
      const user = makeUser({
        systemLanguage: 'fr',
        regionalLanguage: '',
        deviceLocale: 'it',
      } as Partial<User>);
      expect(getUserLanguagePreferences(user)).toEqual(['fr', 'it']);
    });

    it('surfaces deviceLocale as the sole preference when in-app prefs are empty', () => {
      mockGetDeviceLocale.mockReturnValue('de-DE');
      const user = makeUser({
        systemLanguage: undefined as unknown as string,
        regionalLanguage: '',
      });
      expect(getUserLanguagePreferences(user)).toEqual(['de']);
    });

    it('deduplicates deviceLocale when it matches an in-app preference', () => {
      const user = makeUser({
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        deviceLocale: 'EN',
      } as Partial<User>);
      expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en']);
    });
  });
});

describe('getRequiredLanguagesForConversation', () => {
  it('returns empty array for empty users list', () => {
    expect(getRequiredLanguagesForConversation([])).toEqual([]);
  });

  it('returns one language for a single user with systemLanguage', () => {
    const users = [makeUser({ systemLanguage: 'fr' })];
    expect(getRequiredLanguagesForConversation(users)).toEqual(['fr']);
  });

  it('deduplicates when multiple users share the same preferred language', () => {
    const users = [
      makeUser({ systemLanguage: 'fr' }),
      makeUser({ systemLanguage: 'fr' }),
    ];
    expect(getRequiredLanguagesForConversation(users)).toEqual(['fr']);
  });

  it('returns multiple languages when users have different preferences', () => {
    const users = [
      makeUser({ systemLanguage: 'fr' }),
      makeUser({ systemLanguage: 'en' }),
      makeUser({ systemLanguage: 'de' }),
    ];
    const result = getRequiredLanguagesForConversation(users);

    expect(result).toHaveLength(3);
    expect(result).toContain('fr');
    expect(result).toContain('en');
    expect(result).toContain('de');
  });

  it('resolves each user independently via their preferences', () => {
    const userFr = makeUser({ systemLanguage: 'fr' });
    const userEs = makeUser({ systemLanguage: 'es' });

    const result = getRequiredLanguagesForConversation([userFr, userEs]);

    expect(result).toContain('fr');
    expect(result).toContain('es');
    expect(result).toHaveLength(2);
  });
});
