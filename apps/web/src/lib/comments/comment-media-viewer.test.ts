import { describe, expect, test } from 'bun:test';

import type { FeedMedia } from '@/lib/api/feed-pages';
import type { SceneExportSubject } from '@/lib/export/scene/scene-export-subject';

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

  test('la page offre Partager ET Imager ; Imager rend la MÊME pièce, composée, filigranée par l’auteur du commentaire', () => {
    const launched: SceneExportSubject[] = [];
    const page = commentMediaPage({ piece: piece(), commentId: 'c-1', watermark: 'alice', imager: (subject) => launched.push(subject) });
    expect(page?.offers.share).toBe(true);
    expect(page?.share?.intent).toBe('share');
    page?.imager?.();
    expect(launched).toHaveLength(1);
    const [subject] = launched;
    expect(subject?.key).toBe('comment:c-1:pm-1');
    expect(subject?.fileStem).toBe('comment-c-1');
    expect(subject?.watermark).toBe('alice');
    expect(subject?.carrier.media.map((m) => m.mimeType)).toEqual(['video/mp4']);
    expect(subject?.document.scenes[0]?.timelineDuration).toBe(90);
  });

  test('une photo s’image aussi (image fixe)', () => {
    const page = commentMediaPage({ piece: piece({ mimeType: 'image/jpeg', duration: null }), commentId: 'c-1', watermark: null, imager: () => undefined });
    expect(page?.imager).toBeDefined();
  });

  test('une pièce qui ne peut pas sortir (aperçu local de l’appareil) n’offre ni Partager ni Imager', () => {
    expect(commentMediaPage({ piece: piece({ fileUrl: 'blob:http://local/1' }), commentId: 'c-1', watermark: null, imager: () => undefined })).toBeNull();
  });
});
