import { transformTranslationsToArray, type MessageTranslationJSON } from '../translation-transformer';

const makeTranslations = (): Record<string, MessageTranslationJSON> => ({
  en: { text: 'Hello', translationModel: 'basic', createdAt: new Date('2026-01-01') },
  es: { text: 'Hola', translationModel: 'basic', createdAt: new Date('2026-01-01') },
  de: { text: 'Hallo', translationModel: 'basic', createdAt: new Date('2026-01-01') },
});

describe('transformTranslationsToArray', () => {
  it('returns every language when no language filter is supplied (legacy behaviour)', () => {
    const result = transformTranslationsToArray('msg-1', makeTranslations());
    expect(result.map((t) => t.targetLanguage).sort()).toEqual(['de', 'en', 'es']);
  });

  it('returns only the requested languages when a filter is supplied', () => {
    const result = transformTranslationsToArray('msg-1', makeTranslations(), { languages: ['en', 'es'] });
    expect(result.map((t) => t.targetLanguage).sort()).toEqual(['en', 'es']);
  });

  it('matches languages case-insensitively', () => {
    const result = transformTranslationsToArray('msg-1', makeTranslations(), { languages: ['EN'] });
    expect(result.map((t) => t.targetLanguage)).toEqual(['en']);
  });

  it('ignores requested languages that have no translation', () => {
    const result = transformTranslationsToArray('msg-1', makeTranslations(), { languages: ['en', 'fr'] });
    expect(result.map((t) => t.targetLanguage)).toEqual(['en']);
  });

  it('returns an empty array for null/undefined translations regardless of filter', () => {
    expect(transformTranslationsToArray('msg-1', null, { languages: ['en'] })).toEqual([]);
    expect(transformTranslationsToArray('msg-1', undefined)).toEqual([]);
  });

  it('preserves the synthetic id and content shape for a filtered entry', () => {
    const [translation] = transformTranslationsToArray('msg-1', makeTranslations(), { languages: ['es'] });
    expect(translation).toMatchObject({
      id: 'msg-1-es',
      messageId: 'msg-1',
      targetLanguage: 'es',
      translatedContent: 'Hola',
    });
  });
});
