import { describe, it, expect } from '@jest/globals';
import { diffTranslationTargets } from '../translation-targets';

/**
 * `diffTranslationTargets` is the gateway raccord over the shared
 * `normalizeLanguageForDedup` SSOT, shared by the two audio-translation twins
 * (`AttachmentTranslateService`, `AudioTranslateService`). It answers, under
 * canonical comparison: which requested target languages are still MISSING from
 * the store, and does a stored translation key satisfy the caller's request.
 */
describe('diffTranslationTargets', () => {
  it('returns every requested language when nothing is stored yet', () => {
    const diff = diffTranslationTargets(['fr', 'es'], []);
    expect(diff.missing).toEqual(['fr', 'es']);
  });

  it('drops a requested language already present under the SAME canonical key', () => {
    const diff = diffTranslationTargets(['fr', 'es'], ['fr']);
    expect(diff.missing).toEqual(['es']);
  });

  it('treats a region-tagged request as ALREADY translated when the store holds its canonical form', () => {
    // 'en-US' (Accept-Language) must match a stored 'en' — otherwise a redundant
    // NLLB request is dispatched and the cache filter never returns the 'en' row.
    const diff = diffTranslationTargets(['en-US'], ['en']);
    expect(diff.missing).toEqual([]);
  });

  it('treats a case-variant request as ALREADY translated', () => {
    const diff = diffTranslationTargets(['FR'], ['fr']);
    expect(diff.missing).toEqual([]);
  });

  it('deduplicates region variants of the SAME language into a single canonical target', () => {
    // 'fr', 'fr-FR' and 'FR' are one language: one NLLB job, not three.
    const diff = diffTranslationTargets(['fr', 'fr-FR', 'FR'], []);
    expect(diff.missing).toEqual(['fr']);
  });

  it('strips the region subtag of an irreducible-unknown code (region-blind dedup for ALL codes)', () => {
    // 'yue-HK' (Cantonese, outside the catalogue) canonicalises to 'yue' — the
    // exact case the weaker inline `code.toLowerCase()` fallback used to miss.
    const diff = diffTranslationTargets(['yue-HK'], ['yue']);
    expect(diff.missing).toEqual([]);
  });

  it('emits canonical missing codes, not the verbatim request', () => {
    const diff = diffTranslationTargets(['pt-BR', 'de-DE'], ['de']);
    expect(diff.missing).toEqual(['pt']);
  });

  describe('wasRequested', () => {
    it('matches a stored canonical key against a region-tagged request', () => {
      const diff = diffTranslationTargets(['en-US', 'fr'], ['en', 'fr', 'es']);
      expect(diff.wasRequested('en')).toBe(true);
      expect(diff.wasRequested('fr')).toBe(true);
      expect(diff.wasRequested('es')).toBe(false);
    });

    it('matches a region-tagged stored key against a canonical request', () => {
      const diff = diffTranslationTargets(['en'], ['en-US']);
      expect(diff.wasRequested('en-US')).toBe(true);
    });
  });
});
