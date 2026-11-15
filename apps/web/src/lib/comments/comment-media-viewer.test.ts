import { describe, expect, test } from 'bun:test';

import type { FeedMedia } from '@/lib/api/feed-pages';

import { commentMediaAttachment, commentMediaPage, viewableCommentMedia } from './comment-media-viewer';

const piece = (overrides: Partial<FeedMedia> = {}): FeedMedia => ({
  id: 'pm-1',
  mimeType: 'video/mp4',
  fileUrl: 'https://cdn.example/clip.mp4',
  width: 1080,
  height: 1920,
  duration: 90_000,
  ...overrides,
});

describe('le plein écran d’un média de commentaire (#13881)', () => {
  test('seules les photos et vidéos avec une adresse s’ouvrent en plein écran ; un son reste sur place', () => {
    const media = [piece({ id: 'v' }), piece({ id: 'a', mimeType: 'audio/mp4' }), piece({ id: 'i', mimeType: 'image/png' }), piece({ id: 'x', fileUrl: '' })];
    expect(viewableCommentMedia(media).map((m) => m.id)).toEqual(['v', 'i']);
  });

  test('la pièce devient une pièce de visionneuse : sa nature, ses dimensions, sa durée en millisecondes', () => {
    const attachment = commentMediaAttachment(piece(), 'c-1');
    expect(attachment).toMatchObject({ id: 'pm-1', mimeType: 'video/mp4', fileUrl: 'https://cdn.example/clip.mp4', width: 1080, height: 1920, duration: 90_000 });
    expect(attachment.isViewOnce || attachment.isBlurred || attachment.isEncrypted).toBe(false);
  });

  test('la page offre Partager ET Imager ; Imager remet CETTE pièce à l’atelier de carte (#16393)', () => {
    const imaged: FeedMedia[] = [];
    const page = commentMediaPage({ piece: piece(), commentId: 'c-1', imager: (chosen) => imaged.push(chosen) });
    expect(page?.offers.share).toBe(true);
    expect(page?.share?.intent).toBe('share');
    page?.imager?.();
    expect(imaged.map((chosen) => chosen.id)).toEqual(['pm-1']);
  });

  test('une photo s’image aussi (image fixe)', () => {
    const page = commentMediaPage({ piece: piece({ mimeType: 'image/jpeg', duration: null }), commentId: 'c-1', imager: () => undefined });
    expect(page?.imager).toBeDefined();
  });

  test('une pièce qui ne peut pas sortir (aperçu local de l’appareil) n’offre ni Partager ni Imager', () => {
    expect(commentMediaPage({ piece: piece({ fileUrl: 'blob:http://local/1' }), commentId: 'c-1', imager: () => undefined })).toBeNull();
  });
});
