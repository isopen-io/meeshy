import { transformTranslationsToArray, getTranslationFromJSON, type MessageTranslationJSON } from '../translation-transformer';

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

describe('getTranslationFromJSON', () => {
  const translations: Record<string, MessageTranslationJSON> = {
    en: {
      text: 'Hello',
      translationModel: 'nllb',
      confidenceScore: 0.95,
      isEncrypted: false,
      createdAt: new Date('2026-01-01'),
    },
    fr: {
      text: 'Bonjour',
      translationModel: 'nllb',
      isEncrypted: true,
      encryptionKeyId: 'key-1',
      encryptionIv: 'iv-1',
      encryptionAuthTag: 'tag-1',
      createdAt: new Date('2026-01-02'),
    },
  };

  it('returns undefined for null translations', () => {
    expect(getTranslationFromJSON('msg-1', null, 'en')).toBeUndefined();
  });

  it('returns undefined for undefined translations', () => {
    expect(getTranslationFromJSON('msg-1', undefined, 'en')).toBeUndefined();
  });

  it('returns undefined when target language not present', () => {
    expect(getTranslationFromJSON('msg-1', translations, 'de')).toBeUndefined();
  });

  it('returns a MessageTranslation for an existing language', () => {
    const result = getTranslationFromJSON('msg-1', translations, 'en');
    expect(result).toMatchObject({
      id: 'msg-1-en',
      messageId: 'msg-1',
      targetLanguage: 'en',
      translatedContent: 'Hello',
      translationModel: 'nllb',
      confidenceScore: 0.95,
      isEncrypted: false,
    });
  });

  it('maps encryption fields when present', () => {
    const result = getTranslationFromJSON('msg-1', translations, 'fr');
    expect(result).toMatchObject({
      isEncrypted: true,
      encryptionKeyId: 'key-1',
      encryptionIv: 'iv-1',
      encryptionAuthTag: 'tag-1',
    });
  });

  it('defaults isEncrypted to false when field absent', () => {
    const noFlag: Record<string, MessageTranslationJSON> = {
      es: { text: 'Hola', translationModel: 'basic', createdAt: new Date() },
    };
    const result = getTranslationFromJSON('msg-1', noFlag, 'es');
    expect(result?.isEncrypted).toBe(false);
  });

  it('matches the target language case-insensitively (upper-cased request)', () => {
    const result = getTranslationFromJSON('msg-1', translations, 'EN');
    expect(result).toMatchObject({
      id: 'msg-1-en',
      messageId: 'msg-1',
      targetLanguage: 'en',
      translatedContent: 'Hello',
    });
  });

  it('normalises the returned key to the stored casing when the store is upper-cased', () => {
    const upper: Record<string, MessageTranslationJSON> = {
      EN: { text: 'Hello', translationModel: 'basic', createdAt: new Date('2026-01-01') },
    };
    const result = getTranslationFromJSON('msg-1', upper, 'en');
    expect(result).toMatchObject({ id: 'msg-1-EN', targetLanguage: 'EN', translatedContent: 'Hello' });
  });

  it('prefers an exact-case match over a case-insensitive one', () => {
    const mixed: Record<string, MessageTranslationJSON> = {
      EN: { text: 'Upper', translationModel: 'basic', createdAt: new Date('2026-01-01') },
      en: { text: 'Lower', translationModel: 'basic', createdAt: new Date('2026-01-02') },
    };
    const result = getTranslationFromJSON('msg-1', mixed, 'en');
    expect(result).toMatchObject({ targetLanguage: 'en', translatedContent: 'Lower' });
  });

  it('still returns undefined when no language matches under any casing', () => {
    expect(getTranslationFromJSON('msg-1', translations, 'DE')).toBeUndefined();
  });
});
