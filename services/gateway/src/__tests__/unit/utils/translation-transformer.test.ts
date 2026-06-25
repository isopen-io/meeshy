/**
 * Unit tests for translation-transformer utilities.
 * Covers: transformTranslationsToArray (null/empty/full/filtered),
 * createTranslationJSON (all fields, defaults, preserveCreatedAt),
 * getTranslationFromJSON (found, not found, null translations).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  transformTranslationsToArray,
  createTranslationJSON,
  getTranslationFromJSON,
} from '../../../utils/translation-transformer';
import type { MessageTranslationJSON } from '../../../utils/translation-transformer';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const EN_ENTRY: MessageTranslationJSON = {
  text: 'Hello',
  translationModel: 'premium',
  confidenceScore: 0.95,
  isEncrypted: false,
  encryptionKeyId: null,
  encryptionIv: null,
  encryptionAuthTag: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:01:00Z'),
};

const ES_ENTRY: MessageTranslationJSON = {
  text: 'Hola',
  translationModel: 'basic',
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

// ─── transformTranslationsToArray ─────────────────────────────────────────────

describe('transformTranslationsToArray', () => {
  it('returns [] for null input', () => {
    expect(transformTranslationsToArray('msg-1', null)).toEqual([]);
  });

  it('returns [] for undefined input', () => {
    expect(transformTranslationsToArray('msg-1', undefined)).toEqual([]);
  });

  it('returns [] for empty object', () => {
    expect(transformTranslationsToArray('msg-1', {})).toEqual([]);
  });

  it('maps a single language entry to API shape', () => {
    const result = transformTranslationsToArray('msg-1', { en: EN_ENTRY });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'msg-1-en',
      messageId: 'msg-1',
      targetLanguage: 'en',
      translatedContent: 'Hello',
      translationModel: 'premium',
      confidenceScore: 0.95,
      isEncrypted: false,
      createdAt: EN_ENTRY.createdAt,
      updatedAt: EN_ENTRY.updatedAt,
    });
  });

  it('maps multiple language entries', () => {
    const result = transformTranslationsToArray('msg-2', { en: EN_ENTRY, es: ES_ENTRY });
    expect(result).toHaveLength(2);
    const langs = result.map((r) => r.targetLanguage).sort();
    expect(langs).toEqual(['en', 'es']);
  });

  it('filters to specific languages when options.languages is provided', () => {
    const result = transformTranslationsToArray('msg-3', { en: EN_ENTRY, es: ES_ENTRY }, { languages: ['en'] });
    expect(result).toHaveLength(1);
    expect(result[0].targetLanguage).toBe('en');
  });

  it('filter is case-insensitive', () => {
    const result = transformTranslationsToArray('msg-4', { en: EN_ENTRY }, { languages: ['EN'] });
    expect(result).toHaveLength(1);
  });

  it('returns [] when filter matches no languages', () => {
    const result = transformTranslationsToArray('msg-5', { en: EN_ENTRY }, { languages: ['fr'] });
    expect(result).toHaveLength(0);
  });

  it('returns all languages when empty filter array is provided', () => {
    const result = transformTranslationsToArray('msg-6', { en: EN_ENTRY, es: ES_ENTRY }, { languages: [] });
    expect(result).toHaveLength(2);
  });

  it('sets isEncrypted=false when absent in source', () => {
    const result = transformTranslationsToArray('msg-7', { es: ES_ENTRY });
    expect(result[0].isEncrypted).toBe(false);
  });

  it('encryptionKeyId is undefined when source is null', () => {
    const result = transformTranslationsToArray('msg-8', { en: EN_ENTRY });
    expect(result[0].encryptionKeyId).toBeUndefined();
  });

  it('propagates encryption fields when set', () => {
    const encrypted: MessageTranslationJSON = {
      ...EN_ENTRY,
      isEncrypted: true,
      encryptionKeyId: 'key-1',
      encryptionIv: 'iv-1',
      encryptionAuthTag: 'tag-1',
    };
    const result = transformTranslationsToArray('msg-9', { en: encrypted });
    expect(result[0].isEncrypted).toBe(true);
    expect(result[0].encryptionKeyId).toBe('key-1');
    expect(result[0].encryptionIv).toBe('iv-1');
    expect(result[0].encryptionAuthTag).toBe('tag-1');
  });
});

// ─── createTranslationJSON ───────────────────────────────────────────────────

describe('createTranslationJSON', () => {
  it('returns an object with all required fields', () => {
    const json = createTranslationJSON({ text: 'Bonjour', translationModel: 'basic' });

    expect(json.text).toBe('Bonjour');
    expect(json.translationModel).toBe('basic');
    expect(json.createdAt).toBeInstanceOf(Date);
    expect(json.updatedAt).toBeInstanceOf(Date);
  });

  it('defaults isEncrypted to false', () => {
    const json = createTranslationJSON({ text: 'x', translationModel: 'basic' });
    expect(json.isEncrypted).toBe(false);
  });

  it('defaults encryptionKeyId to null', () => {
    const json = createTranslationJSON({ text: 'x', translationModel: 'medium' });
    expect(json.encryptionKeyId).toBeNull();
  });

  it('includes confidenceScore when provided', () => {
    const json = createTranslationJSON({ text: 'Hi', translationModel: 'premium', confidenceScore: 0.9 });
    expect(json.confidenceScore).toBe(0.9);
  });

  it('uses preserveCreatedAt when provided', () => {
    const ts = new Date('2023-06-15T12:00:00Z');
    const json = createTranslationJSON({ text: 'Hi', translationModel: 'basic', preserveCreatedAt: ts });
    expect(json.createdAt).toBe(ts);
  });

  it('propagates encryption fields when provided', () => {
    const json = createTranslationJSON({
      text: 'secret',
      translationModel: 'premium',
      isEncrypted: true,
      encryptionKeyId: 'k',
      encryptionIv: 'iv',
      encryptionAuthTag: 'tag',
    });
    expect(json.isEncrypted).toBe(true);
    expect(json.encryptionKeyId).toBe('k');
    expect(json.encryptionIv).toBe('iv');
    expect(json.encryptionAuthTag).toBe('tag');
  });
});

// ─── getTranslationFromJSON ──────────────────────────────────────────────────

describe('getTranslationFromJSON', () => {
  it('returns undefined for null translations', () => {
    expect(getTranslationFromJSON('msg-1', null, 'en')).toBeUndefined();
  });

  it('returns undefined for undefined translations', () => {
    expect(getTranslationFromJSON('msg-1', undefined, 'en')).toBeUndefined();
  });

  it('returns undefined when target language is absent', () => {
    expect(getTranslationFromJSON('msg-1', { es: ES_ENTRY }, 'en')).toBeUndefined();
  });

  it('returns the matching translation in API shape', () => {
    const result = getTranslationFromJSON('msg-1', { en: EN_ENTRY }, 'en');

    expect(result).toBeDefined();
    expect(result!.id).toBe('msg-1-en');
    expect(result!.messageId).toBe('msg-1');
    expect(result!.targetLanguage).toBe('en');
    expect(result!.translatedContent).toBe('Hello');
    expect(result!.translationModel).toBe('premium');
    expect(result!.confidenceScore).toBe(0.95);
  });

  it('sets isEncrypted=false when absent', () => {
    const result = getTranslationFromJSON('msg-2', { es: ES_ENTRY }, 'es');
    expect(result!.isEncrypted).toBe(false);
  });

  it('encryptionKeyId is undefined when source is null', () => {
    const result = getTranslationFromJSON('msg-3', { en: EN_ENTRY }, 'en');
    expect(result!.encryptionKeyId).toBeUndefined();
  });

  it('propagates encryption fields when set', () => {
    const encrypted: MessageTranslationJSON = {
      ...EN_ENTRY,
      isEncrypted: true,
      encryptionKeyId: 'k',
      encryptionIv: 'iv',
      encryptionAuthTag: 'tag',
    };
    const result = getTranslationFromJSON('msg-4', { en: encrypted }, 'en');
    expect(result!.encryptionKeyId).toBe('k');
    expect(result!.encryptionIv).toBe('iv');
    expect(result!.encryptionAuthTag).toBe('tag');
  });
});
