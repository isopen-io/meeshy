/**
 * Additional coverage for utils/translation-transformer.ts
 * Covers getTranslationFromJSON (lines 121-126) which was previously untested.
 */

import { describe, it, expect } from '@jest/globals';
import { getTranslationFromJSON } from '../../../utils/translation-transformer';

const NOW = new Date('2026-01-01T00:00:00Z');

function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    text: 'Bonjour',
    translationModel: 'basic',
    confidenceScore: 0.95,
    isEncrypted: false,
    encryptionKeyId: null,
    encryptionIv: null,
    encryptionAuthTag: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('getTranslationFromJSON', () => {
  it('returns undefined when translations is null', () => {
    expect(getTranslationFromJSON('msg-1', null, 'fr')).toBeUndefined();
  });

  it('returns undefined when translations is undefined', () => {
    expect(getTranslationFromJSON('msg-1', undefined, 'fr')).toBeUndefined();
  });

  it('returns undefined when target language key does not exist', () => {
    const translations = { en: makeEntry({ text: 'Hello' }) } as any;
    expect(getTranslationFromJSON('msg-1', translations, 'fr')).toBeUndefined();
  });

  it('returns a MessageTranslation for an existing language', () => {
    const translations = { fr: makeEntry() } as any;
    const result = getTranslationFromJSON('msg-1', translations, 'fr');
    expect(result).not.toBeUndefined();
    expect(result?.id).toBe('msg-1-fr');
    expect(result?.messageId).toBe('msg-1');
    expect(result?.targetLanguage).toBe('fr');
    expect(result?.translatedContent).toBe('Bonjour');
    expect(result?.translationModel).toBe('basic');
    expect(result?.confidenceScore).toBe(0.95);
    expect(result?.isEncrypted).toBe(false);
    expect(result?.createdAt).toEqual(NOW);
  });

  it('defaults isEncrypted to false when absent', () => {
    const translations = { de: makeEntry({ isEncrypted: undefined }) } as any;
    const result = getTranslationFromJSON('msg-2', translations, 'de');
    expect(result?.isEncrypted).toBe(false);
  });

  it('includes encryptionKeyId when present', () => {
    const translations = {
      es: makeEntry({ isEncrypted: true, encryptionKeyId: 'key-abc', encryptionIv: 'iv-abc', encryptionAuthTag: 'tag-abc' }),
    } as any;
    const result = getTranslationFromJSON('msg-3', translations, 'es');
    expect(result?.encryptionKeyId).toBe('key-abc');
    expect(result?.encryptionIv).toBe('iv-abc');
    expect(result?.encryptionAuthTag).toBe('tag-abc');
  });

  it('sets encryptionKeyId to undefined when null in source', () => {
    const translations = { en: makeEntry({ encryptionKeyId: null }) } as any;
    const result = getTranslationFromJSON('msg-4', translations, 'en');
    expect(result?.encryptionKeyId).toBeUndefined();
  });
});
