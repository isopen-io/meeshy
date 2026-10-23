import { describe, expect, test } from 'bun:test';

import type { MediaRendition } from '@meeshy/shared/types/attachment';

import { electVideoSource, type VideoSourceInputs } from './video-rendition';

const h264 = (overrides: Partial<MediaRendition> = {}): MediaRendition => ({
  codec: 'h264',
  mimeType: 'video/mp4',
  url: '2026/10/u/clip_h264.mp4',
  width: 1920,
  height: 1080,
  size: 8_000_000,
  ...overrides,
});

const inputs = (overrides: Partial<VideoSourceInputs> = {}): VideoSourceInputs => ({
  fileUrl: '2026/10/u/clip.mov',
  fileSize: 20_000_000,
  renditions: [h264()],
  decodesHevc: true,
  tier: 'high',
  ...overrides,
});

describe('electVideoSource — la vidéo servie au web', () => {
  test('sans rendu de compatibilité, l’original est servi, quel que soit le lecteur', () => {
    expect(electVideoSource(inputs({ renditions: undefined, decodesHevc: false, tier: 'low' }))).toEqual({
      url: '2026/10/u/clip.mov',
      rendition: 'original',
    });
    expect(electVideoSource(inputs({ renditions: [], decodesHevc: false }))).toEqual({ url: '2026/10/u/clip.mov', rendition: 'original' });
  });

  test('un navigateur qui ne décode pas le HEVC reçoit le H.264, même sur un appareil haut de gamme', () => {
    expect(electVideoSource(inputs({ decodesHevc: false, tier: 'pro' }))).toEqual({ url: '2026/10/u/clip_h264.mp4', rendition: 'h264' });
  });

  test('un navigateur qui décode le HEVC garde l’original HDR sur un tier haut ou pro', () => {
    expect(electVideoSource(inputs({ tier: 'high' })).rendition).toBe('original');
    expect(electVideoSource(inputs({ tier: 'pro' })).rendition).toBe('original');
  });

  test('le tier bas prend le H.264 1080p, moins coûteux à décoder, même si le HEVC se lit', () => {
    expect(electVideoSource(inputs({ tier: 'low' })).rendition).toBe('h264');
  });

  test('le tier moyen prend le plus léger des deux', () => {
    expect(electVideoSource(inputs({ tier: 'mid', fileSize: 20_000_000, renditions: [h264({ size: 8_000_000 })] })).rendition).toBe('h264');
    expect(electVideoSource(inputs({ tier: 'mid', fileSize: 5_000_000, renditions: [h264({ size: 8_000_000 })] })).rendition).toBe('original');
  });

  test('le tier moyen sans taille d’original connue garde l’original', () => {
    expect(electVideoSource(inputs({ tier: 'mid', fileSize: undefined })).rendition).toBe('original');
  });

  test('un rendu d’IMAGE (heic, avif) n’est jamais servi comme vidéo', () => {
    const heic: MediaRendition = { codec: 'heic', mimeType: 'image/heic', url: '2026/10/u/p.heic', width: 4032, height: 3024, size: 2_000_000 };
    expect(electVideoSource(inputs({ renditions: [heic], decodesHevc: false })).rendition).toBe('original');
  });

  test('un rendu sans adresse est ignoré', () => {
    expect(electVideoSource(inputs({ renditions: [h264({ url: '' })], decodesHevc: false })).rendition).toBe('original');
  });

  test('une charge qui n’est pas un tableau (ancienne ligne, valeur inattendue) ne lève pas', () => {
    const odd = inputs({ decodesHevc: false });
    expect(electVideoSource({ ...odd, renditions: 'oops' as unknown as readonly MediaRendition[] }).rendition).toBe('original');
  });
});
