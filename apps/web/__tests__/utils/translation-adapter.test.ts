/**
 * Tests for utils/translation-adapter.ts
 */

jest.mock('@/utils/user-language-preferences', () => ({
  resolveUserPreferredLanguage: jest.fn((user: any) => user.systemLanguage || 'fr'),
}));

import {
  translationDataToBubbleTranslation,
  filterValidTranslations,
  groupTranslationsByLanguage,
  getUserTranslation,
  resolveUserLanguage,
} from '@/utils/translation-adapter';
import { resolveUserPreferredLanguage } from '@/utils/user-language-preferences';
import type { TranslationData } from '@/types';

const makeTranslation = (overrides: Partial<TranslationData> = {}): TranslationData => ({
  id: 't1',
  messageId: 'm1',
  sourceLanguage: 'en',
  targetLanguage: 'fr',
  translatedContent: 'Bonjour',
  translationModel: 'nllb-200',
  cacheKey: 'key1',
  cached: false,
  ...overrides,
});

const makeUser = (lang = 'fr') => ({
  id: 'u1',
  systemLanguage: lang,
  regionalLanguage: '',
  customDestinationLanguage: '',
  role: 'USER',
} as any);

// ─── translationDataToBubbleTranslation ───────────────────────────────────────

describe('translationDataToBubbleTranslation', () => {
  it('converts TranslationData to BubbleTranslation', () => {
    const data = makeTranslation();
    const result = translationDataToBubbleTranslation(data);

    expect(result.messageId).toBe('m1');
    expect(result.targetLanguage).toBe('fr');
    expect(result.translatedContent).toBe('Bonjour');
    expect(result.translationModel).toBe('nllb-200');
    expect(result.fromCache).toBe(false);
    expect(result.isOriginal).toBe(false);
  });

  it('builds id from messageId + targetLanguage', () => {
    const data = makeTranslation({ messageId: 'msg1', targetLanguage: 'es' });
    const result = translationDataToBubbleTranslation(data);
    expect(result.id).toBe('msg1_es');
  });

  it('sets isOriginal to true when passed', () => {
    const result = translationDataToBubbleTranslation(makeTranslation(), true);
    expect(result.isOriginal).toBe(true);
  });

  it('reflects cached flag', () => {
    const result = translationDataToBubbleTranslation(makeTranslation({ cached: true }));
    expect(result.fromCache).toBe(true);
  });
});

// ─── filterValidTranslations ──────────────────────────────────────────────────

describe('filterValidTranslations', () => {
  it('filters out translations with empty translatedContent', () => {
    const translations = [
      makeTranslation({ translatedContent: 'Hello' }),
      makeTranslation({ translatedContent: '' }),
    ];
    expect(filterValidTranslations(translations)).toHaveLength(1);
  });

  it('filters out translations with empty targetLanguage', () => {
    const translations = [
      makeTranslation({ targetLanguage: 'fr' }),
      makeTranslation({ targetLanguage: '' }),
    ];
    expect(filterValidTranslations(translations)).toHaveLength(1);
  });

  it('filters out translations with empty messageId', () => {
    const translations = [
      makeTranslation({ messageId: 'msg1' }),
      makeTranslation({ messageId: '' }),
    ];
    expect(filterValidTranslations(translations)).toHaveLength(1);
  });

  it('returns empty array for non-array input', () => {
    expect(filterValidTranslations(null as any)).toEqual([]);
    expect(filterValidTranslations(undefined as any)).toEqual([]);
  });

  it('returns all valid translations unchanged', () => {
    const translations = [makeTranslation(), makeTranslation({ targetLanguage: 'es', translatedContent: 'Hola' })];
    expect(filterValidTranslations(translations)).toHaveLength(2);
  });
});

// ─── groupTranslationsByLanguage ──────────────────────────────────────────────

describe('groupTranslationsByLanguage', () => {
  it('groups translations by targetLanguage', () => {
    const translations = [
      makeTranslation({ targetLanguage: 'fr', translatedContent: 'Bonjour' }),
      makeTranslation({ targetLanguage: 'es', translatedContent: 'Hola' }),
    ];
    const result = groupTranslationsByLanguage(translations);
    expect(result['fr'].translatedContent).toBe('Bonjour');
    expect(result['es'].translatedContent).toBe('Hola');
  });

  it('later translation overwrites earlier one for the same language', () => {
    const translations = [
      makeTranslation({ targetLanguage: 'fr', translatedContent: 'First' }),
      makeTranslation({ targetLanguage: 'fr', translatedContent: 'Second' }),
    ];
    const result = groupTranslationsByLanguage(translations);
    expect(result['fr'].translatedContent).toBe('Second');
  });

  it('returns empty object for empty array', () => {
    expect(groupTranslationsByLanguage([])).toEqual({});
  });
});

// ─── getUserTranslation ───────────────────────────────────────────────────────

describe('getUserTranslation', () => {
  beforeEach(() => {
    (resolveUserPreferredLanguage as jest.Mock).mockImplementation(
      (user: any) => user.systemLanguage || 'fr'
    );
  });

  it('returns null when user language matches original language', () => {
    const user = makeUser('fr');
    const translations = [makeTranslation({ targetLanguage: 'fr' })];
    expect(getUserTranslation(translations, user, 'fr')).toBeNull();
  });

  it('returns translation when user language differs from original', () => {
    const user = makeUser('fr');
    const translations = [makeTranslation({ targetLanguage: 'fr', translatedContent: 'Bonjour' })];
    const result = getUserTranslation(translations, user, 'en');
    expect(result).not.toBeNull();
    expect(result!.translatedContent).toBe('Bonjour');
  });

  it('returns null when no translation matches user language', () => {
    const user = makeUser('de');
    const translations = [makeTranslation({ targetLanguage: 'fr' })];
    expect(getUserTranslation(translations, user, 'en')).toBeNull();
  });
});

// ─── resolveUserLanguage (deprecated alias) ───────────────────────────────────

describe('resolveUserLanguage', () => {
  it('delegates to resolveUserPreferredLanguage', () => {
    const user = makeUser('es');
    const result = resolveUserLanguage(user);
    expect(resolveUserPreferredLanguage).toHaveBeenCalledWith(user);
    expect(result).toBe('es');
  });
});
