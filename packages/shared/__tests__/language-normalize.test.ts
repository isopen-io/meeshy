/**
 * Tests for normalizeLanguageCode helper.
 *
 * Source de vérité TS pour le miroir cross-platform :
 * - Swift SDK  : MeeshyUser.normalizeLanguageCode (packages/MeeshySDK)
 * - Swift app  : ConversationLanguagePreferences.normalize (apps/ios)
 */
import { describe, it, expect } from 'vitest';
import { normalizeLanguageCode } from '../utils/language-normalize';

describe('normalizeLanguageCode', () => {
  it('returns ISO 639-1 for plain code', () => {
    expect(normalizeLanguageCode('fr')).toBe('fr');
  });

  it('strips region tag (dash separator)', () => {
    expect(normalizeLanguageCode('fr-FR')).toBe('fr');
    expect(normalizeLanguageCode('en-US')).toBe('en');
  });

  it('strips region and script tags', () => {
    expect(normalizeLanguageCode('zh-Hant-HK')).toBe('zh');
  });

  it('handles underscore separators (iOS Locale.current.identifier)', () => {
    expect(normalizeLanguageCode('fr_FR')).toBe('fr');
  });

  it('lowercases the language code', () => {
    expect(normalizeLanguageCode('FR-FR')).toBe('fr');
    expect(normalizeLanguageCode('EN')).toBe('en');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLanguageCode('  fr-FR  ')).toBe('fr');
  });

  it('returns undefined for empty input', () => {
    expect(normalizeLanguageCode('')).toBeUndefined();
    expect(normalizeLanguageCode('   ')).toBeUndefined();
  });

  it('returns undefined for nullish input', () => {
    expect(normalizeLanguageCode(undefined)).toBeUndefined();
    expect(normalizeLanguageCode(null)).toBeUndefined();
  });

  it('returns undefined for non-string input', () => {
    expect(normalizeLanguageCode(42 as unknown as string)).toBeUndefined();
    expect(normalizeLanguageCode({} as unknown as string)).toBeUndefined();
  });

  it('returns undefined for malformed input', () => {
    expect(normalizeLanguageCode('@@@')).toBeUndefined();
    expect(normalizeLanguageCode('1-1')).toBeUndefined();
    expect(normalizeLanguageCode('123')).toBeUndefined();
  });

  it('returns undefined for 1-char codes (ISO 639-1 requires 2 letters)', () => {
    expect(normalizeLanguageCode('a')).toBeUndefined();
    expect(normalizeLanguageCode('z')).toBeUndefined();
  });

  it('reduces ISO 639-3 to its supported 2-letter equivalent when unambiguous', () => {
    // "eng"/"fra" have no Meeshy entry but their 2-letter prefix IS supported,
    // and the translator pipeline maps 2-letter codes ("en" → "eng_Latn").
    expect(normalizeLanguageCode('eng')).toBe('en');
    expect(normalizeLanguageCode('fra')).toBe('fr');
  });

  it('preserves supported ISO 639-3 codes verbatim (never truncates)', () => {
    // Cameroonian languages have no ISO 639-1 code and are stored/keyed by their
    // 3-letter code everywhere (translations, NLLB, MessageTranslation). Truncating
    // 'bas' → 'ba' would resolve to Bashkir and break the Prisme Linguistique.
    expect(normalizeLanguageCode('bas')).toBe('bas');
    expect(normalizeLanguageCode('ewo')).toBe('ewo');
    expect(normalizeLanguageCode('dua')).toBe('dua');
    expect(normalizeLanguageCode('nnh')).toBe('nnh');
    expect(normalizeLanguageCode('ksf')).toBe('ksf');
  });

  it('strips region tag from a supported 3-letter code', () => {
    // iOS Locale.current for a Basaa device reports "bas_CM".
    expect(normalizeLanguageCode('bas-CM')).toBe('bas');
    expect(normalizeLanguageCode('BAS_CM')).toBe('bas');
  });

  it('rejects unknown ISO 639-3 whose 2-letter prefix is unsupported', () => {
    // 'spa' → 'sp' would be wrong (Spanish is 'es'); refuse rather than corrupt.
    expect(normalizeLanguageCode('spa')).toBeUndefined();
    expect(normalizeLanguageCode('xyz')).toBeUndefined();
  });

  it('rejects primary subtag containing digits or punctuation', () => {
    expect(normalizeLanguageCode('fr2')).toBeUndefined();
    expect(normalizeLanguageCode('fr!')).toBeUndefined();
  });
});
