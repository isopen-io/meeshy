import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';

import { resolveFeedCardModel } from './card-model';

/**
 * #12316 (suite de W12) — LE FIL ET LES RÉELS LISENT LE RENDU SERVI. Un post
 * porte, comme une pièce de message, `imageVariants` (WebP), `avifVariants`
 * (S7) et `renditions` (le H.264 d'une vidéo HEVC, S6). Le modèle de carte
 * les résout UNE fois, par `attachmentSrc` ; la surface choisit ensuite.
 */
const NOW = new Date('2026-10-23T12:00:00.000Z');
const GATE = 'https://gate.meeshy.me/api/v1/attachments/file/';

const postWith = (media: NonNullable<FeedPost['media']>[number]): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-10-23T11:55:00.000Z',
  media: [media],
});

const model = (post: FeedPost) => resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: NOW });

describe('resolveFeedCardModel — les variantes d’image d’un post', () => {
  test('AVIF et WebP deviennent deux srcset, l’original reste le src', () => {
    const [media] = model(
      postWith({
        id: 'm1',
        mimeType: 'image/jpeg',
        fileUrl: '2026/10/u/photo.jpg',
        imageVariants: [{ width: 640, height: 480, url: '2026/10/u/photo_640w.webp', size: 10, format: 'webp' }],
        avifVariants: [{ width: 640, height: 480, url: '2026/10/u/photo_640w.avif', size: 8, format: 'avif' }],
      }),
    ).media;
    expect(media?.src).toBe(`${GATE}2026%2F10%2Fu%2Fphoto.jpg`);
    expect(media?.srcSet).toBe(`${GATE}2026%2F10%2Fu%2Fphoto_640w.webp 640w`);
    expect(media?.avifSrcSet).toBe(`${GATE}2026%2F10%2Fu%2Fphoto_640w.avif 640w`);
  });

  test('un post d’avant S7 (variantes null) : aucun srcset', () => {
    const [media] = model(postWith({ id: 'm1', mimeType: 'image/jpeg', fileUrl: '2026/10/u/photo.jpg', imageVariants: null, avifVariants: null })).media;
    expect(media?.srcSet).toBeUndefined();
    expect(media?.avifSrcSet).toBeUndefined();
  });
});

describe('resolveFeedCardModel — le rendu H.264 d’une vidéo HEVC', () => {
  test('le rendu de compatibilité est résolu à côté de l’original, avec les deux poids', () => {
    const [media] = model(
      postWith({
        id: 'v1',
        mimeType: 'video/quicktime',
        fileUrl: '2026/10/u/clip.mov',
        fileSize: 20_000_000,
        renditions: [{ codec: 'h264', mimeType: 'video/mp4', url: '2026/10/u/clip_h264.mp4', width: 1920, height: 1080, size: 6_000_000 }],
      }),
    ).media;
    expect(media?.src).toBe(`${GATE}2026%2F10%2Fu%2Fclip.mov`);
    expect(media?.compatSrc).toBe(`${GATE}2026%2F10%2Fu%2Fclip_h264.mp4`);
    expect(media?.compatSize).toBe(6_000_000);
    expect(media?.fileSize).toBe(20_000_000);
  });

  test('sans rendu H.264 (ou un rendu d’image), rien', () => {
    const [media] = model(
      postWith({
        id: 'v1',
        mimeType: 'image/jpeg',
        fileUrl: '2026/10/u/p.jpg',
        renditions: [{ codec: 'heic', mimeType: 'image/heic', url: '2026/10/u/p.heic', width: 1, height: 1, size: 1 }],
      }),
    ).media;
    expect(media?.compatSrc).toBeUndefined();
  });
});
