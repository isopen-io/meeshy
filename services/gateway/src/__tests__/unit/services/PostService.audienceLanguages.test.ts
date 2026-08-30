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
