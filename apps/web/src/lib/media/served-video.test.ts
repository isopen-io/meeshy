import { describe, expect, test } from 'bun:test';

import type { MediaRendition } from '@meeshy/shared/types/attachment';

import { decodesHevcWith, servedVideoSrc, type VideoServingEnv } from './served-video';

const h264: MediaRendition = { codec: 'h264', mimeType: 'video/mp4', url: '2026/10/u/clip_h264.mp4', width: 1920, height: 1080, size: 1 };
const piece = { fileUrl: '2026/10/u/clip.mov', fileSize: 10, renditions: [h264] };
const env = (overrides: Partial<VideoServingEnv> = {}): VideoServingEnv => ({ decodesHevc: () => true, tier: () => 'high', ...overrides });

describe('servedVideoSrc — l’adresse de la vidéo jouée', () => {
  test('le rendu élu passe par la même résolution que fileUrl', () => {
    expect(servedVideoSrc(piece, env({ decodesHevc: () => false }))).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Fu%2Fclip_h264.mp4',
    );
    expect(servedVideoSrc(piece, env())).toBe('https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Fu%2Fclip.mov');
  });

  test('une pièce sans fichier reste sans adresse, même avec un rendu', () => {
    expect(servedVideoSrc({ ...piece, fileUrl: '' }, env({ decodesHevc: () => false }))).toBe('');
  });
});

describe('decodesHevcWith — la sonde du décodeur HEVC', () => {
  test('« probably » ou « maybe » du lecteur : décodé', () => {
    expect(decodesHevcWith({ canPlayType: () => 'probably' })).toBe(true);
    expect(decodesHevcWith({ canPlayType: () => 'maybe' })).toBe(true);
  });

  test('chaîne vide, aucun lecteur, ou sonde qui lève : non décodé', () => {
    expect(decodesHevcWith({ canPlayType: () => '' })).toBe(false);
    expect(decodesHevcWith(undefined)).toBe(false);
    expect(
      decodesHevcWith({
        canPlayType: () => {
          throw new Error('x');
        },
      }),
    ).toBe(false);
  });
});
