import { describe, expect, test } from 'bun:test';

import { feedImageLoading } from './feed-media-preload';

describe('feedImageLoading — une image de moins de 100 Ko se charge sans attendre le défilement', () => {
  test('99 999 octets en ligne : chargée tout de suite', () => {
    expect(feedImageLoading({ sizeBytes: 99_999, online: true })).toBe('eager');
  });

  test('102 400 octets : chargée à l’approche de l’écran', () => {
    expect(feedImageLoading({ sizeBytes: 102_400, online: true })).toBe('lazy');
  });

  test('hors ligne : chargée à l’approche de l’écran', () => {
    expect(feedImageLoading({ sizeBytes: 5_000, online: false })).toBe('lazy');
  });
});
