import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { FeedPost } from '@/lib/api/feed-pages';
import { attachmentSrc } from '@/lib/api/media-url';

import { contentCardModelOf, type ContentCardModel, type ContentCardPage } from './content-card';

/**
 * **CE QUE LE BLOC VISUEL DE LA CARTE D'UN CONTENU MONTRE** (#20234, jumelle
 * web de #20211) — la règle du porteur, rejouée sur le fichier PARTAGÉ que la
 * référence iOS (`ContentCardVisualVectorTests`) et Android rejouent aussi :
 * plusieurs médias se font glisser, une vidéo montre son image de garde, un son
 * seul se joue, et sinon la scène composée se dessine, fond et objets posés.
 */

type ExpectedPage = { readonly mediaId: string; readonly mediaKind: 'image' | 'video' } | { readonly scene: number };

type Expected =
  | { readonly kind: 'none' }
  | { readonly kind: 'media'; readonly mediaId: string; readonly mediaKind: 'image' | 'video' }
  | { readonly kind: 'slideshow'; readonly pages: readonly ExpectedPage[] }
  | { readonly kind: 'sound'; readonly attachmentId: string; readonly url: string; readonly durationSeconds?: number }
  | { readonly kind: 'scene'; readonly index: number; readonly carrierId: string };

type Vector = { readonly _label: string; readonly post: FeedPost; readonly expected: Expected };

const FILE = fileURLToPath(new URL('../../../../../packages/shared/fixtures/content-card-visual/content-card-visual.vectors.json', import.meta.url));
const vectors = JSON.parse(readFileSync(FILE, 'utf8')) as readonly Vector[];

const params = { preferredLanguages: [], now: new Date('2026-11-21T12:00:00.000Z'), linkType: null, language: 'fr' } as const;

/** Ce que la carte montre, dans le vocabulaire des vecteurs. */
function pageOf(page: ContentCardPage): ExpectedPage {
  return page.kind === 'scene' ? { scene: page.index } : { mediaId: page.media.id, mediaKind: page.media.kind };
}

function shownOf(model: ContentCardModel): Expected {
  const { visual } = model;
  switch (visual.kind) {
    case 'none':
      return { kind: 'none' };
    case 'media':
      return { kind: 'media', mediaId: visual.media.id, mediaKind: visual.media.kind };
    case 'slideshow':
      return { kind: 'slideshow', pages: visual.pages.map(pageOf) };
    case 'sound':
      return {
        kind: 'sound',
        attachmentId: visual.sound.attachmentId,
        url: visual.sound.url,
        ...(visual.sound.durationSeconds === undefined ? {} : { durationSeconds: visual.sound.durationSeconds }),
      };
    case 'scene':
      return { kind: 'scene', index: visual.index, carrierId: model.scene?.carrier.postId ?? '' };
  }
}

describe('contentCardModelOf — le bloc visuel rejoue les vecteurs partagés', () => {
  test('le fichier est lu, couvre les cinq rendus, et une boucle vide ne peut pas passer', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(14);
    expect(new Set(vectors.map((vector) => vector.expected.kind))).toEqual(new Set(['none', 'media', 'slideshow', 'sound', 'scene']));
  });

  for (const vector of vectors) {
    test(vector._label, () => {
      expect(shownOf(contentCardModelOf(vector.post, params))).toEqual(vector.expected);
    });
  }

  test('une scène dessinée porte son document et les médias du contenu, résolus', () => {
    const story = vectors.find((vector) => vector.expected.kind === 'scene' && vector.post.type === 'STORY' && vector.post.repostOf == null);
    const model = contentCardModelOf(story!.post, params);
    expect(model.scene?.document.scenes.length).toBe(1);
    expect(model.scene?.carrier.media.map((media) => media.id)).toEqual(['m-img']);
    expect(model.scene?.carrier.media[0]?.src).toBe(attachmentSrc('/f/i.jpg'));
  });
});
