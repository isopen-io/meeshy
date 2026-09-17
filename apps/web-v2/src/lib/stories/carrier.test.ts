import { describe, expect, test } from 'bun:test';

import { attachmentSrc } from '@/lib/api/media-url';
import { parseCanvasDocument, type CanvasScene } from '@/lib/canvas/document';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';

import { readerBackdropHash, storyCarrier } from './carrier';

/**
 * Le porteur et le fond plein écran d'une story de scène (#6899,
 * revue-correction). Les vecteurs reprennent la FORME relevée sur
 * `gate.staging.meeshy.me` le 2026-09-17 : médias en `fileUrl`, fond élu porté
 * par un objet `content` + `isBackground` à côté d'un objet `bg` sans image.
 */

function sceneOf(scene: unknown): CanvasScene {
  const parsed = parseCanvasDocument({ v: 3, scenes: [scene] })?.scenes[0];
  if (parsed === undefined) throw new Error('vecteur invalide');
  return parsed;
}

const HASH_SLIDE = 'H3UJFAL3Z4iYh4aoZ6j3in+v+A==';
const HASH_MEDIA = '3nQFFAT4WIiod4WYZ6joeo+u9w==';

describe('storyCarrier — le porteur lit la clé que la passerelle sert', () => {
  test('`fileUrl` ⇒ `src` résolu, rapport et vignette recopiés', () => {
    const carrier = storyCarrier({
      id: 'p1',
      media: [{ id: 'm1', fileUrl: '2026/09/a/pano.jpg', mimeType: 'image/jpeg', width: 1600, height: 400, thumbnailUrl: null, thumbHash: HASH_MEDIA }],
    });
    expect(carrier).toEqual({
      postId: 'p1',
      media: [
        {
          id: 'm1',
          src: attachmentSrc('2026/09/a/pano.jpg'),
          mimeType: 'image/jpeg',
          width: 1600,
          height: 400,
          poster: thumbHashPlaceholder(HASH_MEDIA) as string,
        },
      ],
    });
  });

  test('une pièce SANS adresse n’entre pas dans le porteur — elle masquerait le `mediaURL` de l’objet', () => {
    expect(storyCarrier({ id: 'p1', media: [{ id: 'm1', fileUrl: null }] }).media).toEqual([]);
  });

  test('la vignette servie prime sur le ThumbHash', () => {
    const carrier = storyCarrier({ id: 'p1', media: [{ id: 'm1', fileUrl: 'a.mp4', thumbnailUrl: 'a.jpg', thumbHash: HASH_MEDIA }] });
    expect(carrier.media[0]?.poster).toBe(attachmentSrc('a.jpg'));
  });
});

describe('readerBackdropHash — la cascade du fond flou du lecteur', () => {
  const stagingScene = (thumbHash?: string) =>
    sceneOf({
      id: 's1',
      ...(thumbHash !== undefined ? { thumbHash } : {}),
      objects: [
        { id: 'bg', kind: 'media', plane: 'bg', z: 0, anchor: { t: 'free', x: 0.5, y: 0.5 }, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { transform: { videoFitMode: 'fit' } } },
        {
          id: 'pic',
          kind: 'media',
          plane: 'content',
          z: 1,
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { isBackground: true, postMediaId: 'm1', aspectRatio: 4, mediaType: 'image' },
        },
      ],
    });

  test('le ThumbHash de la SLIDE d’abord', () => {
    expect(readerBackdropHash(stagingScene(HASH_SLIDE), { media: [{ id: 'm1', thumbHash: HASH_MEDIA }] })).toBe(HASH_SLIDE);
  });

  test('sans lui, celui de la pièce que le fond ÉLU désigne — jamais l’objet `bg` vide posé avant lui', () => {
    expect(readerBackdropHash(stagingScene(), { media: [{ id: 'm1', thumbHash: HASH_MEDIA }] })).toBe(HASH_MEDIA);
  });

  test('aucune source ⇒ `undefined` (le noir du lecteur se voit)', () => {
    expect(readerBackdropHash(stagingScene(), { media: [] })).toBeUndefined();
  });
});
