/**
 * @jest-environment node
 *
 * Règle de composition d'un RÉEL (directive user 2026-08-02, étendue par la
 * directive durée minimale) : video (>=3s) || audio (>=3s) || >= 2 images —
 * miroir exact du SDK (`ReelComposition.qualifiesAsReel`, FeedModels.swift,
 * suite `ReelCompositionTests`). Les cas ci-dessous répliquent la suite Swift.
 * Les images ne sont jamais soumises à la condition de durée.
 *
 * `qualifiesAsReel` vit désormais dans `@meeshy/shared/utils/reel-composition`
 * (source unique, testée aussi côté shared dans
 * `packages/shared/__tests__/utils/reel-composition.test.ts`) — ce fichier
 * reste une couverture de régression au point de consommation gateway.
 */

import { describe, it, expect } from '@jest/globals';
import { qualifiesAsReel } from '@meeshy/shared/utils/reel-composition';

const LONG = 5000;

const media = (...entries: Array<string | null | [string | null, number | null | undefined]>) =>
  entries.map((entry) =>
    Array.isArray(entry)
      ? { mimeType: entry[0], duration: entry[1] }
      : { mimeType: entry, duration: LONG },
  );

describe('qualifiesAsReel', () => {
  it('qualifies a video, an audio, or at least two images (sufficient duration)', () => {
    expect(qualifiesAsReel(media('video/mp4'))).toBe(true);
    expect(qualifiesAsReel(media('audio/mp4'))).toBe(true);
    expect(qualifiesAsReel(media('image/jpeg', 'image/png'))).toBe(true);
    expect(qualifiesAsReel(media('image/jpeg', 'image/png', 'image/heic'))).toBe(true);
    expect(qualifiesAsReel(media('audio/mpeg', 'image/heic'))).toBe(true);
    expect(qualifiesAsReel(media('video/quicktime', 'image/jpeg'))).toBe(true);
  });

  it('does NOT qualify a single image — the 2→1 removal trap', () => {
    expect(qualifiesAsReel(media('image/jpeg'))).toBe(false);
    expect(qualifiesAsReel(media('image/jpeg', 'application/pdf'))).toBe(false);
  });

  it('never qualifies an empty or non-media composition', () => {
    expect(qualifiesAsReel([])).toBe(false);
    expect(qualifiesAsReel(media('application/pdf'))).toBe(false);
    expect(qualifiesAsReel(media('application/pdf', 'text/plain'))).toBe(false);
  });

  it('treats a null or unknown mimeType as non-qualifying', () => {
    expect(qualifiesAsReel(media(null))).toBe(false);
    expect(qualifiesAsReel(media(null, null))).toBe(false);
    expect(qualifiesAsReel(media('video/mp4', null))).toBe(true);
  });

  it('is case-insensitive on the MIME type', () => {
    expect(qualifiesAsReel(media('IMAGE/JPEG', 'Image/PNG'))).toBe(true);
    expect(qualifiesAsReel(media('VIDEO/MP4'))).toBe(true);
    expect(qualifiesAsReel(media('IMAGE/JPEG'))).toBe(false);
  });

  it('does NOT qualify a video or audio under 3 seconds', () => {
    expect(qualifiesAsReel(media(['video/mp4', 2999]))).toBe(false);
    expect(qualifiesAsReel(media(['audio/mp4', 2999]))).toBe(false);
    expect(qualifiesAsReel(media(['video/mp4', 0]))).toBe(false);
  });

  it('qualifies a video or audio at exactly 3 seconds', () => {
    expect(qualifiesAsReel(media(['video/mp4', 3000]))).toBe(true);
    expect(qualifiesAsReel(media(['audio/mp4', 3000]))).toBe(true);
  });

  it('treats a missing or null duration on video/audio as non-qualifying', () => {
    expect(qualifiesAsReel(media(['video/mp4', null]))).toBe(false);
    expect(qualifiesAsReel(media(['video/mp4', undefined]))).toBe(false);
    expect(qualifiesAsReel(media(['audio/mp4', null]))).toBe(false);
  });

  it('never applies the duration floor to images', () => {
    expect(qualifiesAsReel(media(['image/jpeg', 0], ['image/png', null]))).toBe(true);
  });

  it('a short video is rescued by a second qualifying image pair', () => {
    expect(qualifiesAsReel(media(['video/mp4', 500], 'image/jpeg', 'image/png'))).toBe(true);
  });
});
