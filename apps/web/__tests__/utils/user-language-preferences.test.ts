/**
 * Tests for user-language-preferences
 *
 * Verifies language resolution following Linguistic Prism priority:
 * 1. systemLanguage, 2. regionalLanguage, 3. customDestinationLanguage,
 * 4. deviceLocale (persisted or navigator), 5. 'fr' fallback
 */

import { getDeviceLocale } from '@/lib/device-locale';
import {
  getUserLanguageChoices,
  resolveUserPreferredLanguage,
  getUserLanguagePreferences,
  getRequiredLanguagesForConversation,
} from '@/utils/user-language-preferences';
import type { User } from '@/types';

jest.mock('@/lib/device-locale', () => ({
  getDeviceLocale: jest.fn(() => null),
}));

const mockGetDeviceLocale = getDeviceLocale as jest.Mock;

const makeUser = (overrides: Partial<Record<string, unknown>> = {}): User =>
  ({
    id: 'user-1',
    username: 'test',
    email: 'test@example.com',
    systemLanguage: '',
    regionalLanguage: '',
    customDestinationLanguage: null,
    ...overrides,
  } as unknown as User);

describe('getUserLanguageChoices', () => {
  it('returns system language choice as default', () => {
    const user = makeUser({ systemLanguage: 'fr' });
    const choices = getUserLanguageChoices(user);

    expect(choices).toHaveLength(1);
    expect(choices[0]?.code).toBe('fr');
    expect(choices[0]?.isDefault).toBe(true);
    expect(choices[0]?.name).toBe('Langue système');
  });

  it('falls back to fr code when systemLanguage is absent', () => {
    const user = makeUser({ systemLanguage: undefined });
    const choices = getUserLanguageChoices(user);

    expect(choices[0]?.code).toBe('fr');
  });

  it('uses description from SUPPORTED_LANGUAGES for known code', () => {
    const user = makeUser({ systemLanguage: 'en' });
    const choices = getUserLanguageChoices(user);
    expect(choices[0]?.description).toBeTruthy();
  });

  it('falls back to Français description and French flag for unknown code', () => {
    const user = makeUser({ systemLanguage: 'xx' });
    const choices = getUserLanguageChoices(user);
    expect(choices[0]?.flag).toBe('🇫🇷');
    expect(choices[0]?.description).toBe('Français');
  });

  it('includes regional language when different from system', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'en' });
    const choices = getUserLanguageChoices(user);

    expect(choices).toHaveLength(2);
    expect(choices[1]?.code).toBe('en');
    expect(choices[1]?.isDefault).toBe(false);
    expect(choices[1]?.name).toBe('Langue régionale');
  });

  it('omits regional language when same as system language', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'fr' });
    const choices = getUserLanguageChoices(user);
    expect(choices).toHaveLength(1);
  });

  it('uses globe fallback flag for unknown regional language code', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'xx' });
    const choices = getUserLanguageChoices(user);
    expect(choices[1]?.flag).toBe('🌍');
  });

  it('uses regional language code as description fallback when unknown', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'xx' });
    const choices = getUserLanguageChoices(user);
    expect(choices[1]?.description).toBe('xx');
  });

  it('includes custom destination language when unique', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'es',
    });
    const choices = getUserLanguageChoices(user);

    expect(choices).toHaveLength(3);
    expect(choices[2]?.code).toBe('es');
    expect(choices[2]?.name).toBe('Langue personnalisée');
    expect(choices[2]?.isDefault).toBe(false);
  });

  it('omits custom destination when same as system language', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'fr',
    });
    const choices = getUserLanguageChoices(user);
    expect(choices).toHaveLength(2);
  });

  it('omits custom destination when same as regional language', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'en',
    });
    const choices = getUserLanguageChoices(user);
    expect(choices).toHaveLength(2);
  });

  it('uses target-emoji flag fallback for unknown custom destination code', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'xx',
    });
    const choices = getUserLanguageChoices(user);
    expect(choices[2]?.flag).toBe('🎯');
  });

  it('uses code as description fallback for unknown custom destination', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'xx',
    });
    const choices = getUserLanguageChoices(user);
    expect(choices[2]?.description).toBe('xx');
  });

  it('uses SUPPORTED_LANGUAGES description for known custom destination', () => {
    const user = makeUser({
      systemLanguage: 'fr',
      regionalLanguage: 'en',
      customDestinationLanguage: 'es',
    });
    const choices = getUserLanguageChoices(user);
    expect(choices[2]?.description).toBeTruthy();
    expect(choices[2]?.description).not.toBe('es');
  });
});

describe('resolveUserPreferredLanguage', () => {
  beforeEach(() => {
    mockGetDeviceLocale.mockReturnValue(null);
  });

  it('returns systemLanguage as highest priority', () => {
    const user = makeUser({
      systemLanguage: 'en',
      regionalLanguage: 'fr',
      customDestinationLanguage: 'es',
    });
    expect(resolveUserPreferredLanguage(user)).toBe('en');
  });

  it('returns regionalLanguage when systemLanguage is absent', () => {
    const user = makeUser({ systemLanguage: '', regionalLanguage: 'en', customDestinationLanguage: 'es' });
    expect(resolveUserPreferredLanguage(user)).toBe('en');
  });

  it('returns customDestinationLanguage as third priority', () => {
    const user = makeUser({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: 'es' });
    expect(resolveUserPreferredLanguage(user)).toBe('es');
  });

  it('uses persisted user.deviceLocale as fourth priority', () => {
    const user = makeUser({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: null });
    (user as any).deviceLocale = 'de';
    expect(resolveUserPreferredLanguage(user)).toBe('de');
  });

  it('falls back to getDeviceLocale() when user.deviceLocale is undefined', () => {
    const user = makeUser({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: null });
    mockGetDeviceLocale.mockReturnValue('pt');
    expect(resolveUserPreferredLanguage(user)).toBe('pt');
  });

  it('falls back to fr when no language is configured and device locale is null', () => {
    const user = makeUser({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: null });
    mockGetDeviceLocale.mockReturnValue(null);
    expect(resolveUserPreferredLanguage(user)).toBe('fr');
  });

  it('prefers persisted user.deviceLocale over getDeviceLocale()', () => {
    const user = makeUser({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: null });
    (user as any).deviceLocale = 'ja';
    mockGetDeviceLocale.mockReturnValue('zh');
    expect(resolveUserPreferredLanguage(user)).toBe('ja');
  });

  it('falls back to getDeviceLocale() when user.deviceLocale is null', () => {
    const user = makeUser({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: null });
    (user as any).deviceLocale = null;
    mockGetDeviceLocale.mockReturnValue('ko');
    expect(resolveUserPreferredLanguage(user)).toBe('ko');
  });

  it('handles locale with region suffix (en-US) via normalization', () => {
    const user = makeUser({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: null });
    (user as any).deviceLocale = 'en-US';
    expect(resolveUserPreferredLanguage(user)).toBe('en');
  });
});

describe('getUserLanguagePreferences', () => {
  it('returns empty array when no languages configured', () => {
    const user = makeUser({ systemLanguage: undefined, regionalLanguage: undefined, customDestinationLanguage: null });
    expect(getUserLanguagePreferences(user)).toEqual([]);
  });

  it('includes systemLanguage', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: undefined });
    expect(getUserLanguagePreferences(user)).toEqual(['fr']);
  });

  it('includes unique systemLanguage and regionalLanguage', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'en' });
    expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en']);
  });

  it('deduplicates when regional equals system', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'fr' });
    expect(getUserLanguagePreferences(user)).toEqual(['fr']);
  });

  it('includes customDestinationLanguage when different from both', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: 'es' });
    expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en', 'es']);
  });

  it('omits customDestinationLanguage when same as systemLanguage', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: 'fr' });
    expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en']);
  });

  it('omits customDestinationLanguage when same as regionalLanguage', () => {
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: 'en' });
    expect(getUserLanguagePreferences(user)).toEqual(['fr', 'en']);
  });

  it('includes only customDestinationLanguage when it is the only one', () => {
    const user = makeUser({ systemLanguage: undefined, regionalLanguage: undefined, customDestinationLanguage: 'es' });
    expect(getUserLanguagePreferences(user)).toEqual(['es']);
  });
});

describe('getRequiredLanguagesForConversation', () => {
  beforeEach(() => {
    mockGetDeviceLocale.mockReturnValue(null);
  });

  it('returns empty array for empty user list', () => {
    expect(getRequiredLanguagesForConversation([])).toEqual([]);
  });

  it('returns language for single user', () => {
    const users = [makeUser({ systemLanguage: 'en' })];
    expect(getRequiredLanguagesForConversation(users)).toEqual(['en']);
  });

  it('returns all unique languages for users with different preferences', () => {
    const users = [
      makeUser({ systemLanguage: 'en' }),
      makeUser({ systemLanguage: 'fr' }),
      makeUser({ systemLanguage: 'es' }),
    ];
    const langs = getRequiredLanguagesForConversation(users);
    expect(langs).toContain('en');
    expect(langs).toContain('fr');
    expect(langs).toContain('es');
    expect(langs).toHaveLength(3);
  });

  it('deduplicates when users share the same language', () => {
    const users = [
      makeUser({ systemLanguage: 'fr' }),
      makeUser({ systemLanguage: 'fr' }),
    ];
    expect(getRequiredLanguagesForConversation(users)).toEqual(['fr']);
  });

  it('falls back to fr for users with no language configured', () => {
    const users = [makeUser({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: null })];
    expect(getRequiredLanguagesForConversation(users)).toEqual(['fr']);
  });

  it('combines languages from multiple users correctly', () => {
    const users = [
      makeUser({ systemLanguage: 'en' }),
      makeUser({ systemLanguage: '' }),
    ];
    const langs = getRequiredLanguagesForConversation(users);
    expect(langs).toContain('en');
    expect(langs).toContain('fr');
    expect(langs).toHaveLength(2);
  });
});
