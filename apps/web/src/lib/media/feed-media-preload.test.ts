import { describe, expect, test } from 'bun:test';

import { feedImageLoading, feedVideoPreload } from './feed-media-preload';

describe('feedVideoPreload — une vidéo de moins de 100 Ko se télécharge seule (#14639)', () => {
  test('99 999 octets en ligne : préchargée entière', () => {
    expect(feedVideoPreload({ sizeBytes: 99_999, online: true })).toBe('auto');
  });

  test('102 400 octets : la vidéo attend le premier ▶︎', () => {
    expect(feedVideoPreload({ sizeBytes: 102_400, online: true })).toBe('none');
  });

  test('hors ligne, même petite : rien ne part', () => {
    expect(feedVideoPreload({ sizeBytes: 5_000, online: false })).toBe('none');
  });

  test('taille inconnue : rien ne part', () => {
    expect(feedVideoPreload({ sizeBytes: 0, online: true })).toBe('none');
  });
});

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
