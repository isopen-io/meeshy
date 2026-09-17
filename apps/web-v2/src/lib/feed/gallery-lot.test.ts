import { describe, expect, test } from 'bun:test';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import { POST_IMAGE_FR, POST_SCENE_CLIP_A, POST_SCENES_MIXED } from '@/lib/api/fixtures-feed';
import type { FeedPost } from '@/lib/api/feed-pages';
import { kindOf } from '@/lib/view/message';

import { resolveFeedCardModel } from './card-model';
import { SCENE_MIME, boundedSceneIndex, composeSceneGalleryLot, sceneItemId } from './gallery-lot';

/**
 * `composeSceneGalleryLot` (#6902, T1) — LE LOT D'UNE PUBLICATION À SCÈNES,
 * miroir `PostGalleryLot`. `POST_SCENES_MIXED` (3 scènes, 2 médias) et
 * `POST_SCENE_CLIP_A` (1 scène cinématique, son de fond) sont le MÊME corpus
 * de fixtures que `check-feed-scenes.mjs` exerce déjà.
 */

const modelOf = (post: FeedPost) =>
  resolveFeedCardModel(post, { preferredLanguages: ['fr', 'en'], now: new Date('2026-09-17T12:00:00.000Z') });

describe('composeSceneGalleryLot — le lot d’un post à scènes (miroir PostGalleryLot)', () => {
  test('post-scenes-mixed (3 scènes) ⇒ 3 pièces SYNTHÉTIQUES, ids par INDEX, INERTES', () => {
    const model = modelOf(POST_SCENES_MIXED);
    const lot = composeSceneGalleryLot(model);
    expect(lot).not.toBeUndefined();
    if (lot === undefined) return;

    expect(lot.items.length).toBe(3);
    expect(lot.items.map((i) => i.id)).toEqual([
      sceneItemId('post-scenes-mixed', 0),
      sceneItemId('post-scenes-mixed', 1),
      sceneItemId('post-scenes-mixed', 2),
    ]);
    for (const item of lot.items) {
      expect(item.mimeType).toBe(SCENE_MIME);
      // La nature d'une page est SYNTHÉTIQUE : `kindOf` (qui ne connaît que
      // les MIME réels) la classe `file`, jamais image/vidéo/audio.
      expect(kindOf(item)).toBe('file');
      // Une pièce SYNTHÉTIQUE n'est jamais « masquée » — aucun fichier réel
      // à protéger, et le moteur de scène gère sa propre protection.
      expect(maskedAttachment(item)).toBe(false);
      expect(item.fileUrl).toBe('');
    }
  });

  test('scenes.get(id) porte le bon sceneIndex, document et carrier', () => {
    const model = modelOf(POST_SCENES_MIXED);
    const lot = composeSceneGalleryLot(model);
    if (lot === undefined) throw new Error('lot attendu');

    const entry1 = lot.scenes.get(sceneItemId('post-scenes-mixed', 1));
    expect(entry1).not.toBeUndefined();
    expect(entry1?.sceneIndex).toBe(1);
    expect(entry1?.document).toBe(model.scene?.document);
    expect(entry1?.carrier).toBe(model.scene?.carrier);
  });

  test('une scène STATIQUE (post-scenes-mixed) ⇒ moves=false ; une scène VIDÉO/son de fond ⇒ moves=true', () => {
    const staticModel = modelOf(POST_SCENES_MIXED);
    const staticLot = composeSceneGalleryLot(staticModel);
    expect(staticLot?.scenes.get(sceneItemId('post-scenes-mixed', 0))?.moves).toBe(false);

    const clipModel = modelOf(POST_SCENE_CLIP_A);
    const clipLot = composeSceneGalleryLot(clipModel);
    expect(clipLot?.scenes.get(sceneItemId('post-scene-clip-a', 0))?.moves).toBe(true);
  });

  test('sans scène (repli média, D-78) ⇒ undefined', () => {
    const model = modelOf(POST_IMAGE_FR);
    expect(model.scene).toBeUndefined();
    expect(composeSceneGalleryLot(model)).toBeUndefined();
  });
});

describe('boundedSceneIndex — l’entrée, BORNÉE au nombre de scènes', () => {
  test('un index dans les bornes est inchangé', () => {
    expect(boundedSceneIndex(3, 1)).toBe(1);
  });
  test('un index négatif ou hors bornes est BORNÉ, jamais une page vide', () => {
    expect(boundedSceneIndex(3, -1)).toBe(0);
    expect(boundedSceneIndex(3, 9)).toBe(2);
  });
  test('zéro scène ⇒ 0', () => {
    expect(boundedSceneIndex(0, 5)).toBe(0);
  });
});
