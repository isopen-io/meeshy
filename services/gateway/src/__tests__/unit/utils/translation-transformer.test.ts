import {
  transformTranslationsToArray,
  createTranslationJSON,
  getTranslationFromJSON,
} from '../../../utils/translation-transformer';
import type { MessageTranslationJSON } from '../../../utils/translation-transformer';

const MSG_ID = 'aaaaaa000000000000000001';

function makeEntry(overrides: Partial<MessageTranslationJSON> = {}): MessageTranslationJSON {
  return {
    text: 'Hello',
    translationModel: 'basic',
    confidenceScore: 0.9,
    isEncrypted: false,
    encryptionKeyId: null,
    encryptionIv: null,
    encryptionAuthTag: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('transformTranslationsToArray', () => {
  it('returns empty array for null input', () => {
    expect(transformTranslationsToArray(MSG_ID, null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(transformTranslationsToArray(MSG_ID, undefined)).toEqual([]);
  });

  it('returns empty array for empty object', () => {
    expect(transformTranslationsToArray(MSG_ID, {})).toEqual([]);
  });

  it('maps a single language entry to MessageTranslation', () => {
    const entry = makeEntry({ text: 'Bonjour' });
    const result = transformTranslationsToArray(MSG_ID, { fr: entry });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: `${MSG_ID}-fr`,
      messageId: MSG_ID,
      targetLanguage: 'fr',
      translatedContent: 'Bonjour',
      translationModel: 'basic',
      confidenceScore: 0.9,
      isEncrypted: false,
    });
  });

  it('maps multiple language entries', () => {
    const translations = {
      en: makeEntry({ text: 'Hello' }),
      es: makeEntry({ text: 'Hola' }),
    };
    const result = transformTranslationsToArray(MSG_ID, translations);
    expect(result).toHaveLength(2);
    const langs = result.map((r) => r.targetLanguage);
    expect(langs).toContain('en');
    expect(langs).toContain('es');
  });

  it('filters to only requested languages when options.languages is set', () => {
    const translations = {
      en: makeEntry({ text: 'Hello' }),
      es: makeEntry({ text: 'Hola' }),
      fr: makeEntry({ text: 'Bonjour' }),
    };
    const result = transformTranslationsToArray(MSG_ID, translations, { languages: ['en', 'fr'] });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.targetLanguage)).not.toContain('es');
  });

  it('language filter comparison is case-insensitive', () => {
    const translations = { EN: makeEntry({ text: 'Hello' }) };
    const result = transformTranslationsToArray(MSG_ID, translations, { languages: ['en'] });
    expect(result).toHaveLength(1);
  });

  it('returns all languages when options.languages is empty array', () => {
    const translations = {
      en: makeEntry(),
      es: makeEntry(),
    };
    const result = transformTranslationsToArray(MSG_ID, translations, { languages: [] });
    expect(result).toHaveLength(2);
  });

  it('sets encryptionKeyId, encryptionIv, encryptionAuthTag from entry', () => {
    const entry = makeEntry({
      isEncrypted: true,
      encryptionKeyId: 'key-1',
      encryptionIv: 'iv-1',
      encryptionAuthTag: 'tag-1',
    });
    const result = transformTranslationsToArray(MSG_ID, { fr: entry });
    expect(result[0]).toMatchObject({
      isEncrypted: true,
      encryptionKeyId: 'key-1',
      encryptionIv: 'iv-1',
      encryptionAuthTag: 'tag-1',
    });
  });

  it('defaults isEncrypted to false when absent', () => {
    const entry = makeEntry({ isEncrypted: undefined });
    const result = transformTranslationsToArray(MSG_ID, { fr: entry });
    expect(result[0].isEncrypted).toBe(false);
  });

  it('preserves createdAt and updatedAt', () => {
    const createdAt = new Date('2023-05-01T12:00:00Z');
    const updatedAt = new Date('2023-05-02T08:00:00Z');
    const entry = makeEntry({ createdAt, updatedAt });
    const result = transformTranslationsToArray(MSG_ID, { en: entry });
    expect(result[0].createdAt).toEqual(createdAt);
    expect(result[0].updatedAt).toEqual(updatedAt);
  });
});

describe('createTranslationJSON', () => {
  it('creates a translation with required fields', () => {
    const result = createTranslationJSON({ text: 'Hello', translationModel: 'basic' });
    expect(result.text).toBe('Hello');
    expect(result.translationModel).toBe('basic');
    expect(result.isEncrypted).toBe(false);
    expect(result.encryptionKeyId).toBeNull();
    expect(result.encryptionIv).toBeNull();
    expect(result.encryptionAuthTag).toBeNull();
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('sets confidenceScore when provided', () => {
    const result = createTranslationJSON({ text: 'x', translationModel: 'premium', confidenceScore: 0.95 });
    expect(result.confidenceScore).toBe(0.95);
  });

  it('sets isEncrypted and encryption fields when provided', () => {
    const result = createTranslationJSON({
      text: 'x',
      translationModel: 'medium',
      isEncrypted: true,
      encryptionKeyId: 'k',
      encryptionIv: 'iv',
      encryptionAuthTag: 'tag',
    });
    expect(result.isEncrypted).toBe(true);
    expect(result.encryptionKeyId).toBe('k');
    expect(result.encryptionIv).toBe('iv');
    expect(result.encryptionAuthTag).toBe('tag');
  });

  it('preserves createdAt when preserveCreatedAt is set', () => {
    const original = new Date('2020-01-01T00:00:00Z');
    const result = createTranslationJSON({ text: 'x', translationModel: 'basic', preserveCreatedAt: original });
    expect(result.createdAt).toEqual(original);
  });

  it('uses a fresh date when preserveCreatedAt is absent', () => {
    const before = new Date();
    const result = createTranslationJSON({ text: 'x', translationModel: 'basic' });
    const after = new Date();
    expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('getTranslationFromJSON', () => {
  it('returns undefined when translations is null', () => {
    expect(getTranslationFromJSON(MSG_ID, null, 'fr')).toBeUndefined();
  });

  it('returns undefined when translations is undefined', () => {
    expect(getTranslationFromJSON(MSG_ID, undefined, 'fr')).toBeUndefined();
  });

  it('returns undefined when targetLanguage is not present', () => {
    const translations = { en: makeEntry({ text: 'Hello' }) };
    expect(getTranslationFromJSON(MSG_ID, translations, 'fr')).toBeUndefined();
  });

  it('returns the correct MessageTranslation when found', () => {
    const entry = makeEntry({ text: 'Bonjour', translationModel: 'premium' });
    const result = getTranslationFromJSON(MSG_ID, { fr: entry }, 'fr');
    expect(result).toBeDefined();
    expect(result!.id).toBe(`${MSG_ID}-fr`);
    expect(result!.messageId).toBe(MSG_ID);
    expect(result!.targetLanguage).toBe('fr');
    expect(result!.translatedContent).toBe('Bonjour');
    expect(result!.translationModel).toBe('premium');
  });

  it('sets isEncrypted from entry data', () => {
    const entry = makeEntry({ isEncrypted: true, encryptionKeyId: 'key-x' });
    const result = getTranslationFromJSON(MSG_ID, { en: entry }, 'en');
    expect(result!.isEncrypted).toBe(true);
    expect(result!.encryptionKeyId).toBe('key-x');
  });

  it('defaults isEncrypted to false when not set', () => {
    const entry = makeEntry({ isEncrypted: undefined });
    const result = getTranslationFromJSON(MSG_ID, { en: entry }, 'en');
    expect(result!.isEncrypted).toBe(false);
  });

  it('matches case-insensitively when stored key is upper-case', () => {
    const entry = makeEntry({ text: 'Bonjour' });
    const result = getTranslationFromJSON(MSG_ID, { FR: entry }, 'fr');
    expect(result).toBeDefined();
    expect(result!.translatedContent).toBe('Bonjour');
  });

  it('matches case-insensitively when requested language is upper-case', () => {
    const entry = makeEntry({ text: 'Hola' });
    const result = getTranslationFromJSON(MSG_ID, { es: entry }, 'ES');
    expect(result).toBeDefined();
    expect(result!.translatedContent).toBe('Hola');
  });

  it('matches regional variants case-insensitively', () => {
    const entry = makeEntry({ text: 'Olá' });
    const result = getTranslationFromJSON(MSG_ID, { 'pt-BR': entry }, 'pt-br');
    expect(result).toBeDefined();
    expect(result!.translatedContent).toBe('Olá');
  });

  it('prefers the exact-case entry over a case-insensitive sibling', () => {
    const lower = makeEntry({ text: 'lower' });
    const upper = makeEntry({ text: 'upper' });
    const result = getTranslationFromJSON(MSG_ID, { fr: lower, FR: upper }, 'fr');
    expect(result!.translatedContent).toBe('lower');
  });
});
