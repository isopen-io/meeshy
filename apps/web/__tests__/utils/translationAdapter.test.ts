const mockResolveUserPreferredLanguage = jest.fn();

jest.mock('@/utils/user-language-preferences', () => ({
  resolveUserPreferredLanguage: (...args: unknown[]) => mockResolveUserPreferredLanguage(...args),
}));

import {
  translationDataToBubbleTranslation,
  getUserTranslation,
  resolveUserLanguage,
  filterValidTranslations,
  groupTranslationsByLanguage,
} from '@/utils/translation-adapter';
import type { TranslationData } from '@/types';

const makeTranslation = (overrides = {}): TranslationData => ({
  id: 'tr-1',
  messageId: 'msg-1',
  sourceLanguage: 'en',
  targetLanguage: 'fr',
  translatedContent: 'Bonjour',
  translationModel: 'NLLB',
  cacheKey: 'msg-1:en:fr',
  cached: false,
  ...overrides,
} as TranslationData);

const makeUser = (overrides = {}) => ({ id: 'user-1', systemLanguage: 'fr', ...overrides } as any);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('translationDataToBubbleTranslation', () => {
  it('maps all fields from TranslationData to BubbleTranslation', () => {
    const translation = makeTranslation({ messageId: 'msg-42', targetLanguage: 'es', translatedContent: 'Hola', translationModel: 'OPUS', cached: true });
    const result = translationDataToBubbleTranslation(translation);

    expect(result.id).toBe('msg-42_es');
    expect(result.messageId).toBe('msg-42');
    expect(result.targetLanguage).toBe('es');
    expect(result.translatedContent).toBe('Hola');
    expect(result.translationModel).toBe('OPUS');
    expect(result.fromCache).toBe(true);
  });

  it('sets isOriginal to false by default', () => {
    const result = translationDataToBubbleTranslation(makeTranslation());
    expect(result.isOriginal).toBe(false);
  });

  it('sets isOriginal to true when second argument is true', () => {
    const result = translationDataToBubbleTranslation(makeTranslation(), true);
    expect(result.isOriginal).toBe(true);
  });

  it('sets processingTimeMs to 0 (not available in TranslationData)', () => {
    const result = translationDataToBubbleTranslation(makeTranslation());
    expect(result.processingTimeMs).toBe(0);
  });

  it('constructs id as messageId_targetLanguage', () => {
    const result = translationDataToBubbleTranslation(makeTranslation({ messageId: 'msg-1', targetLanguage: 'fr' }));
    expect(result.id).toBe('msg-1_fr');
  });

  it('sets createdAt to a Date instance', () => {
    const result = translationDataToBubbleTranslation(makeTranslation());
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});

describe('resolveUserLanguage', () => {
  it('delegates to resolveUserPreferredLanguage and returns its result', () => {
    mockResolveUserPreferredLanguage.mockReturnValue('de');
    const user = makeUser({ systemLanguage: 'de' });
    expect(resolveUserLanguage(user)).toBe('de');
    expect(mockResolveUserPreferredLanguage).toHaveBeenCalledWith(user);
  });

  it('passes the user object through unchanged', () => {
    const user = makeUser({ systemLanguage: 'es' });
    mockResolveUserPreferredLanguage.mockReturnValue('es');
    resolveUserLanguage(user);
    expect(mockResolveUserPreferredLanguage).toHaveBeenCalledWith(user);
  });
});

describe('getUserTranslation', () => {
  it('returns null when target language matches original language', () => {
    mockResolveUserPreferredLanguage.mockReturnValue('en');
    const translations = [makeTranslation({ targetLanguage: 'fr' })];
    const result = getUserTranslation(translations, makeUser(), 'en');
    expect(result).toBeNull();
  });

  it('returns null when no translation matches the resolved language', () => {
    mockResolveUserPreferredLanguage.mockReturnValue('fr');
    const translations = [makeTranslation({ targetLanguage: 'es' })];
    const result = getUserTranslation(translations, makeUser(), 'en');
    expect(result).toBeNull();
  });

  it('returns BubbleTranslation for the matching target language', () => {
    mockResolveUserPreferredLanguage.mockReturnValue('fr');
    const translation = makeTranslation({ targetLanguage: 'fr', translatedContent: 'Bonjour' });
    const result = getUserTranslation([translation], makeUser(), 'en');
    expect(result).not.toBeNull();
    expect(result?.targetLanguage).toBe('fr');
    expect(result?.translatedContent).toBe('Bonjour');
  });

  it('uses resolveUserLanguage to determine the target language', () => {
    mockResolveUserPreferredLanguage.mockReturnValue('de');
    const translations = [
      makeTranslation({ targetLanguage: 'fr' }),
      makeTranslation({ targetLanguage: 'de', translatedContent: 'Hallo' }),
    ];
    const user = makeUser();
    const result = getUserTranslation(translations, user, 'en');
    expect(mockResolveUserPreferredLanguage).toHaveBeenCalledWith(user);
    expect(result?.targetLanguage).toBe('de');
  });

  it('returns null when translations array is empty', () => {
    mockResolveUserPreferredLanguage.mockReturnValue('fr');
    const result = getUserTranslation([], makeUser(), 'en');
    expect(result).toBeNull();
  });
});

describe('filterValidTranslations', () => {
  it('returns all translations when all have truthy required fields', () => {
    const translations = [
      makeTranslation({ messageId: 'msg-1', targetLanguage: 'fr', translatedContent: 'Bonjour' }),
      makeTranslation({ messageId: 'msg-2', targetLanguage: 'es', translatedContent: 'Hola' }),
    ];
    expect(filterValidTranslations(translations)).toHaveLength(2);
  });

  it('filters out translations with empty translatedContent', () => {
    const valid = makeTranslation({ translatedContent: 'Bonjour' });
    const invalid = makeTranslation({ translatedContent: '' });
    expect(filterValidTranslations([valid, invalid])).toEqual([valid]);
  });

  it('filters out translations with empty targetLanguage', () => {
    const valid = makeTranslation({ targetLanguage: 'fr' });
    const invalid = makeTranslation({ targetLanguage: '' });
    expect(filterValidTranslations([valid, invalid])).toEqual([valid]);
  });

  it('filters out translations with empty messageId', () => {
    const valid = makeTranslation({ messageId: 'msg-1' });
    const invalid = makeTranslation({ messageId: '' });
    expect(filterValidTranslations([valid, invalid])).toEqual([valid]);
  });

  it('returns empty array for empty input', () => {
    expect(filterValidTranslations([])).toEqual([]);
  });

  it('returns empty array when passed a non-array value', () => {
    expect(filterValidTranslations(null as any)).toEqual([]);
    expect(filterValidTranslations(undefined as any)).toEqual([]);
  });
});

describe('groupTranslationsByLanguage', () => {
  it('returns an empty object for an empty array', () => {
    expect(groupTranslationsByLanguage([])).toEqual({});
  });

  it('groups a single translation under its targetLanguage key', () => {
    const translation = makeTranslation({ targetLanguage: 'fr' });
    const result = groupTranslationsByLanguage([translation]);
    expect(result['fr']).toBe(translation);
  });

  it('groups multiple translations by their respective targetLanguage keys', () => {
    const frTranslation = makeTranslation({ targetLanguage: 'fr', translatedContent: 'Bonjour' });
    const esTranslation = makeTranslation({ targetLanguage: 'es', translatedContent: 'Hola' });
    const result = groupTranslationsByLanguage([frTranslation, esTranslation]);
    expect(result['fr']).toBe(frTranslation);
    expect(result['es']).toBe(esTranslation);
  });

  it('overwrites earlier translation when two share the same targetLanguage', () => {
    const first = makeTranslation({ targetLanguage: 'fr', translatedContent: 'Premier' });
    const second = makeTranslation({ targetLanguage: 'fr', translatedContent: 'Deuxième' });
    const result = groupTranslationsByLanguage([first, second]);
    expect(result['fr']).toBe(second);
  });

  it('returns a plain object with targetLanguage codes as keys', () => {
    const translation = makeTranslation({ targetLanguage: 'pt' });
    const result = groupTranslationsByLanguage([translation]);
    expect(Object.keys(result)).toEqual(['pt']);
  });
});
