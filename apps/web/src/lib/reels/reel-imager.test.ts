import { describe, expect, test } from 'bun:test';

import { REEL_SCENE_LOOP, REEL_STUDIO } from '@/lib/api/fixtures-reels';
import { resolveFeedCardModel } from '@/lib/feed/card-model';

import type { PublicationImageRequest } from '@/lib/export/publication-image-store';

import { reelImager } from './reel-imager';

const NOW = new Date('2026-09-14T09:00:00.000Z');

const spy = (): { readonly open: (request: PublicationImageRequest) => void; readonly opened: PublicationImageRequest[] } => {
  const opened: PublicationImageRequest[] = [];
  return { opened, open: (request) => void opened.push(request) };
};

describe('reelImager — la baguette du réel ouvre l’atelier de carte (#16333, #16393)', () => {
  test('un réel à scène y arrive avec sa scène à rendre, sous sa clé de publication', async () => {
    const { open, opened } = spy();
    const model = resolveFeedCardModel(REEL_SCENE_LOOP, { preferredLanguages: ['fr'], now: NOW });
    await reelImager(open)(model);
    expect(opened.map((request) => request.key)).toEqual([`post:${model.id}`]);
    expect(opened[0]?.scene).not.toBeNull();
  });

  test('un réel SIMPLE (sa vidéo, sans scène) s’image aussi, sa vidéo en média (#16166)', async () => {
    const { open, opened } = spy();
    const model = resolveFeedCardModel(REEL_STUDIO, { preferredLanguages: ['fr'], now: NOW });
    await reelImager(open)(model);
    expect(opened.map((request) => request.key)).toEqual([`post:${model.id}`]);
    expect(opened[0]?.scene).toBeNull();
    expect(opened[0]?.subject.media.map((item) => item.card.kind)).toContain('video');
  });

  test('un réel protégé ne s’image pas', async () => {
    const { open, opened } = spy();
    const model = resolveFeedCardModel(REEL_STUDIO, { preferredLanguages: ['fr'], now: NOW });
    await reelImager(open)({ ...model, protection: { isViewOnce: true } });
    expect(opened).toEqual([]);
  });
});
