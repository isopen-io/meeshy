/**
 * Règle de composition d'un RÉEL — prédicat PUR, source unique partagée
 * (gateway + web, import direct de `@meeshy/shared/utils/reel-composition`).
 * Miroir exact du SDK iOS `ReelComposition.qualifiesAsReel`
 * (packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift).
 *
 * Règle : vidéo (>= MIN_QUALIFYING_DURATION_MS) || audio (>= même seuil) ||
 * au moins deux images. Une durée absente/nulle sur vidéo/audio est TOUJOURS
 * non-qualifiante (jamais un fallback permissif). Les images ne sont jamais
 * soumises à la condition de durée.
 */

import { describe, it, expect } from 'vitest';
import { qualifiesAsReel, MIN_QUALIFYING_DURATION_MS } from '../../utils/reel-composition';

const LONG = 5000;

const media = (...entries: Array<string | null | [string | null, number | null | undefined]>) =>
  entries.map((entry) =>
    Array.isArray(entry)
      ? { mimeType: entry[0], duration: entry[1] }
      : { mimeType: entry, duration: LONG },
  );

describe('MIN_QUALIFYING_DURATION_MS', () => {
  it('is 3000ms', () => {
    expect(MIN_QUALIFYING_DURATION_MS).toBe(3000);
  });
});

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

  it('does NOT qualify a video or audio under 3 seconds (boundary: 2999ms)', () => {
    expect(qualifiesAsReel(media(['video/mp4', 2999]))).toBe(false);
    expect(qualifiesAsReel(media(['audio/mp4', 2999]))).toBe(false);
    expect(qualifiesAsReel(media(['video/mp4', 0]))).toBe(false);
  });

  it('qualifies a video or audio at exactly 3000ms', () => {
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

  it('one qualifying image is not enough even with a short video', () => {
    expect(qualifiesAsReel(media(['video/mp4', 500], 'image/jpeg'))).toBe(false);
  });
});
