/**
 * G3 — pure pins for the shared audience-language resolution used by BOTH
 * story translation pipelines (content + textObjects). Replaces the fixed
 * 10-language list the textObjects pipeline used to fire regardless of who
 * could actually see the story.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostService } from '../../../services/PostService';

describe('PostService.audienceLanguages', () => {
  it('dedupes and preserves first-seen order', () => {
    expect(PostService.audienceLanguages(['fr', 'es', 'fr', 'pt', 'es']))
      .toEqual(['fr', 'es', 'pt']);
  });

  it('drops the en pivot and empty values', () => {
    expect(PostService.audienceLanguages(['en', null, undefined, '', 'de']))
      .toEqual(['de']);
  });

  it('caps at 10 languages', () => {
    const many = ['fr', 'es', 'de', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru', 'it', 'nl', 'sv'];
    expect(PostService.audienceLanguages(many)).toHaveLength(10);
  });

  it('returns empty for an author without contacts (no ZMQ job fired)', () => {
    expect(PostService.audienceLanguages([])).toEqual([]);
  });

  // Codes reach this resolver verbatim: `systemLanguage` is persisted without
  // normalization (z.string().optional()), so BCP-47 region/script subtags and
  // mixed case produced by web (Accept-Language) and iOS (Locale.current) — 'en-US',
  // 'pt-BR', 'FR', 'fr_FR' — arrive intact. They MUST be canonicalized (via the
  // shared normalizeLanguageForDedup SSOT) BEFORE the pivot filter and the dedup,
  // otherwise NLLB targets duplicate/leak the pivot and the cap fills with variants.
  it('canonicalizes region/script-tagged variants before deduping (one target per language)', () => {
    expect(PostService.audienceLanguages(['fr', 'fr-FR', 'FR', 'fr_FR']))
      .toEqual(['fr']);
  });

  it('drops region-tagged and mixed-case forms of the en pivot', () => {
    expect(PostService.audienceLanguages(['en-US', 'EN', 'en_GB', 'de']))
      .toEqual(['de']);
  });

  it('emits canonical Meeshy codes, never the raw variant', () => {
    expect(PostService.audienceLanguages(['pt-BR', 'ES']))
      .toEqual(['pt', 'es']);
  });

  it('caps at 10 real languages, not variants', () => {
    const twelveRealAcrossVariants = [
      'fr', 'fr-FR', 'es', 'es-ES', 'de', 'de-DE', 'pt', 'pt-BR',
      'ar', 'zh', 'ja', 'ko', 'ru', 'it', 'nl', 'sv',
    ];
    // 12 distinct real languages, several doubled as regional variants:
    expect(PostService.audienceLanguages(twelveRealAcrossVariants)).toEqual([
      'fr', 'es', 'de', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru', 'it',
    ]);
  });

  // `systemLanguage` is persisted verbatim (`z.string().optional()`, no
  // write-time normalization), so region-tagged / mixed-case BCP-47 values
  // (`'en-US'`, `'pt-BR'`, `'FR'`) produced by the web (`Accept-Language`) or
  // iOS (`Locale.current.identifier`) reach this resolver. They must be
  // canonicalized through the shared dedup SSOT BEFORE the `en` pivot filter
  // and dedup — otherwise the ZMQ translator receives invalid NLLB targets and
  // duplicate jobs for the same language.
  it('canonicalizes region-tagged codes so the en pivot is still dropped', () => {
    // 'en-US' / 'EN' must fold to 'en' and be filtered as the pivot.
    expect(PostService.audienceLanguages(['en-US', 'EN', 'es']))
      .toEqual(['es']);
  });

  it('dedupes region variants of the same language into one NLLB target', () => {
    // 'fr', 'fr-FR' and 'FR' are one target language, not three.
    expect(PostService.audienceLanguages(['fr', 'fr-FR', 'FR', 'pt-BR']))
      .toEqual(['fr', 'pt']);
  });

  it('caps at 10 AFTER canonical dedup, not on raw variants', () => {
    const many = [
      'fr', 'fr-FR', 'es', 'es-419', 'de', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru',
    ];
    // The region variants collapse, leaving 9 distinct canonical languages.
    expect(PostService.audienceLanguages(many))
      .toEqual(['fr', 'es', 'de', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru']);
  });
});
