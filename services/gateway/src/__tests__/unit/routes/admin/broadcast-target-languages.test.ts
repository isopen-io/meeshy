/**
 * Pure pins for the admin-broadcast NLLB target-language aggregate.
 *
 * The `POST /admin/broadcasts/:id/preview` handler builds this list from a
 * Prisma `groupBy(['systemLanguage'])`, whose grouping is on RAW column values
 * and therefore does NOT collapse region/script-tagged or mixed-case variants.
 * `User.systemLanguage` is persisted verbatim (`z.string().optional()`), so
 * `en-US`, `pt-BR`, `FR`, `fr_FR` reach the aggregate intact. Sent to the
 * translator as-is they duplicate NLLB jobs, leak the source language past the
 * service filter, and persist variants instead of real languages — the same
 * class fixed for stories in `PostService.audienceLanguages`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { broadcastTargetLanguages } from '../../../../routes/admin/broadcast-target-languages';

describe('broadcastTargetLanguages', () => {
  it('dedupes and preserves first-seen order', () => {
    expect(broadcastTargetLanguages(['fr', 'es', 'fr', 'pt', 'es'], 'en'))
      .toEqual(['fr', 'es', 'pt']);
  });

  it('drops empty and nullish recipient languages', () => {
    expect(broadcastTargetLanguages([null, undefined, '', 'de'], 'en'))
      .toEqual(['de']);
  });

  it('canonicalizes region/script-tagged variants before deduping (one target per language)', () => {
    expect(broadcastTargetLanguages(['fr', 'fr-FR', 'FR', 'fr_FR'], 'en'))
      .toEqual(['fr']);
  });

  it('emits canonical Meeshy codes, never the raw variant', () => {
    expect(broadcastTargetLanguages(['pt-BR', 'ES'], 'en'))
      .toEqual(['pt', 'es']);
  });

  it('drops the broadcast source language (a source is never a target)', () => {
    expect(broadcastTargetLanguages(['fr', 'en', 'es'], 'en'))
      .toEqual(['fr', 'es']);
  });

  it('drops region-tagged / mixed-case forms of the source language', () => {
    // Source 'en-US' and recipients 'EN'/'en_GB' all canonicalize to 'en' —
    // none may survive as a target, which the raw `l !== sourceLanguage`
    // filter would have missed entirely.
    expect(broadcastTargetLanguages(['EN', 'en_GB', 'de'], 'en-US'))
      .toEqual(['de']);
  });

  it('returns empty when every recipient shares the source language', () => {
    expect(broadcastTargetLanguages(['en', 'en-US', 'EN'], 'en'))
      .toEqual([]);
  });

  it('returns empty for no recipients', () => {
    expect(broadcastTargetLanguages([], 'fr')).toEqual([]);
  });
});
