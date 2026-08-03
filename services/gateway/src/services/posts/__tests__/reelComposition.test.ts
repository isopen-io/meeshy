/**
 * @jest-environment node
 *
 * Règle de composition d'un RÉEL (directive user 2026-08-02) :
 * video || audio || >= 2 images — miroir exact du SDK
 * (`ReelComposition.qualifiesAsReel`, FeedModels.swift, suite
 * `ReelCompositionTests`). Les cas ci-dessous répliquent la suite Swift.
 */

import { describe, it, expect } from '@jest/globals';
import { qualifiesAsReel } from '../reelComposition';

const media = (...mimeTypes: Array<string | null>) =>
  mimeTypes.map((mimeType) => ({ mimeType }));

describe('qualifiesAsReel', () => {
  it('qualifies a video, an audio, or at least two images', () => {
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
});
