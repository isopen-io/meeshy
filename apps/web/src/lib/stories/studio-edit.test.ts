import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';

import { buildStoryCanvasEffectsPages } from './story-document';
import { currentStudioPage } from './studio';
import { studioEditHydration, type StudioEditHydration } from './studio-edit';
import { settlePages, studioPublishPlan } from './studio-publish';
import { newTextLayer } from './studio-text';

/**
 * **MODIFIER UNE PUBLICATION ROUVRE LE STUDIO** (#9317) — la loi PURE qui
 * relit une publication servie (`Post.storyEffects` + `Post.media`) en
 * brouillon de studio. Ce qui compte : les médias déjà montés reviennent
 * PRÊTS (jamais remontés), chaque scène redevient une page, et rien n'est
 * détruit en silence — une matière que le studio ne sait pas porter refuse
 * l'hydratation plutôt que de la perdre à l'enregistrement.
 */

const VIEWER = 'u-auteur';
const resolveUrl = (fileUrl: string) => `https://cdn.test/${fileUrl}`;

const text = (id: string, value: string, overrides: Partial<ReturnType<typeof newTextLayer>> = {}) => ({
  ...newTextLayer({ id, language: 'fr', text: value }),
  ...overrides,
});

/** Un document que le STUDIO a lui-même publié — deux scènes : un fond image
 * légendé sous un texte posé, puis un calque vidéo et un son de fond. */
const studioDocument = () =>
  buildStoryCanvasEffectsPages(
    [
      {
        id: 'page-1',
        texts: [text('text-1', 'Bonjour', { color: 'FF2E63', style: 'neon', align: 'left', pose: { x: 0.3, y: 0.2, scale: 1.5, rotation: 12 } })],
        background: {
          source: { postMediaId: 'pm-fond', fileUrl: '2026/10/u/fond.jpg', thumbHash: 'hash-fond' },
          mediaType: 'image',
          aspectRatio: 0.75,
          frame: { fitMode: 'fill', backdrop: 'black' },
          filter: 'vintage',
        },
      },
      {
        id: 'page-2',
        texts: [text('text-2', 'Au revoir')],
        overlay: {
          source: { postMediaId: 'pm-calque', fileUrl: '2026/10/u/calque.mp4' },
          mediaType: 'video',
          pose: { x: 0.6, y: 0.4, scale: 0.8, rotation: -20 },
        },
        sound: { source: { postMediaId: 'pm-son', fileUrl: '2026/10/u/son.m4a' }, plane: 'background' },
        duration: 6,
        opening: 'fade',
      },
    ],
    'hero',
  );

const post = (overrides: Partial<FeedPost> = {}): FeedPost => ({
  id: 'p-1',
  type: 'POST',
  createdAt: '2026-10-01T10:00:00.000Z',
  content: 'Le corps du post',
  originalLanguage: 'fr',
  visibility: 'FRIENDS',
  author: { id: VIEWER },
  storyEffects: studioDocument(),
  media: [
    { id: 'pm-fond', fileUrl: '2026/10/u/fond.jpg', mimeType: 'image/jpeg', caption: 'Le port', alt: 'Des bateaux' },
    { id: 'pm-calque', fileUrl: '2026/10/u/calque.mp4', mimeType: 'video/mp4', duration: 4200 },
    { id: 'pm-son', fileUrl: '2026/10/u/son.m4a', mimeType: 'audio/mp4', duration: 6000 },
  ],
  ...overrides,
});

const hydrate = (served: FeedPost, viewerId: string = VIEWER): StudioEditHydration =>
  studioEditHydration({ post: served, viewerId, resolveUrl, language: 'fr' });

const studio = (hydration: StudioEditHydration) => {
  if (hydration.kind !== 'studio') throw new Error(`hydratation refusée : ${hydration.reason}`);
  return hydration;
};

describe('studioEditHydration — une publication du studio redevient un brouillon (#9317)', () => {
  test('chaque SCÈNE redevient une PAGE, dans l’ordre, et la première est courante', () => {
    const { draft } = studio(hydrate(post()));
    expect(draft.pages.map((page) => page.id)).toEqual(['page-1', 'page-2']);
    expect(draft.currentPage).toBe('page-1');
  });

  test('les médias déjà montés reviennent PRÊTS, adressés par leur identité serveur — rien à remonter', () => {
    const { draft } = studio(hydrate(post()));
    const [first, second] = draft.pages;
    expect(first?.background?.upload).toEqual({ phase: 'ready', postMediaId: 'pm-fond', fileUrl: '2026/10/u/fond.jpg', thumbHash: 'hash-fond' });
    expect(first?.background?.previewUrl).toBe('https://cdn.test/2026/10/u/fond.jpg');
    expect(first?.background?.file).toBeUndefined();
    expect(second?.overlay?.upload).toMatchObject({ phase: 'ready', postMediaId: 'pm-calque' });
    expect(second?.overlay?.mediaType).toBe('video');
    expect(second?.overlay?.durationMs).toBe(4200);
    expect(second?.sound?.upload).toMatchObject({ phase: 'ready', postMediaId: 'pm-son' });
    expect(second?.sound?.plane).toBe('background');
  });

  test('le fond garde son cadre, son filtre, sa proportion, sa légende et son texte alternatif', () => {
    const background = studio(hydrate(post())).draft.pages[0]?.background;
    expect(background?.frame).toEqual({ fitMode: 'fill', backdrop: 'black' });
    expect(background?.filter).toBe('vintage');
    expect(background?.aspectRatio).toBe(0.75);
    expect(background?.caption).toBe('Le port');
    expect(background?.alt).toBe('Des bateaux');
  });

  test('un texte posé garde son identité, sa langue, son style, sa couleur, son alignement et sa pose', () => {
    const layer = studio(hydrate(post())).draft.pages[0]?.texts[0];
    expect(layer).toMatchObject({ id: 'text-1', text: 'Bonjour', language: 'fr', style: 'neon', color: 'FF2E63', align: 'left' });
    expect(layer?.pose).toEqual({ x: 0.3, y: 0.2, scale: 1.5, rotation: 12 });
  });

  test('le calque garde sa pose ; la scène animée garde sa durée et son entrée', () => {
    const second = studio(hydrate(post())).draft.pages[1];
    expect(second?.overlay?.pose).toEqual({ x: 0.6, y: 0.4, scale: 0.8, rotation: -20 });
    expect(second?.duration).toBe(6);
    expect(second?.opening).toBe('fade');
  });

  test('le corps du post, son audience et son format sont repris ; l’origine retient médias et disposition', () => {
    const hydration = studio(hydrate(post()));
    expect(hydration.draft.postText).toBe('Le corps du post');
    expect(hydration.draft.visibility).toBe('FRIENDS');
    expect(hydration.origin).toEqual({
      postId: 'p-1',
      kind: 'POST',
      mediaIds: ['pm-fond', 'pm-calque', 'pm-son'],
      layout: 'hero',
      content: 'Le corps du post',
      originalLanguage: 'fr',
      visibility: 'FRIENDS',
    });
  });

  test('une story et un réel gardent leur format', () => {
    expect(studio(hydrate(post({ type: 'STORY' }))).origin.kind).toBe('STORY');
    expect(studio(hydrate(post({ type: 'REEL' }))).origin.kind).toBe('REEL');
  });

  test('ALLER-RETOUR : republier le brouillon relu rend EXACTEMENT le document servi', async () => {
    const served = post();
    const { draft, origin } = studio(hydrate(served));
    const settled = await settlePages(draft.pages, () => null);
    const plan = studioPublishPlan({ pages: draft.pages, settled, choice: { kind: 'POST', layout: origin.layout } });
    expect(plan.kind).toBe('ready');
    if (plan.kind !== 'ready') return;
    expect(plan.publications[0]?.storyEffects).toEqual(served.storyEffects as never);
    expect(plan.publications[0]?.mediaIds).toEqual(['pm-fond', 'pm-calque', 'pm-son']);
  });

  test('un média du document adressé SANS identité est retrouvé par son URL parmi les médias du post', () => {
    const document = {
      v: 3,
      scenes: [
        {
          id: 'scene-ios',
          objects: [
            { id: 'bgm', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 0, transform: {}, payload: { mediaURL: '2026/10/u/ios.jpg', mediaType: 'image', isBackground: true } },
          ],
        },
      ],
    };
    const { draft } = studio(hydrate(post({ storyEffects: document, media: [{ id: 'pm-ios', fileUrl: '2026/10/u/ios.jpg', mimeType: 'image/jpeg' }] })));
    expect(draft.pages[0]?.background?.upload).toMatchObject({ phase: 'ready', postMediaId: 'pm-ios' });
  });

  test('deux textes de MÊME identité (deux scènes iOS) ne se confondent pas dans le brouillon', () => {
    const document = {
      v: 3,
      scenes: ['a', 'b'].map((scene) => ({
        id: scene,
        objects: [{ id: 'titre', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 3, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: scene } }],
      })),
    };
    const { draft } = studio(hydrate(post({ storyEffects: document, media: [] })));
    const ids = draft.pages.flatMap((page) => page.texts.map((layer) => layer.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('une publication SANS canvas mais avec des médias : une page par visuel, le son sur la première', () => {
    const { draft } = studio(
      hydrate(
        post({
          storyEffects: null,
          media: [
            { id: 'pm-a', fileUrl: 'a.jpg', mimeType: 'image/jpeg', width: 1200, height: 800 },
            { id: 'pm-b', fileUrl: 'b.mp4', mimeType: 'video/mp4' },
            { id: 'pm-c', fileUrl: 'c.m4a', mimeType: 'audio/mp4' },
          ],
        }),
      ),
    );
    expect(draft.pages).toHaveLength(2);
    expect(draft.pages[0]?.background?.upload).toMatchObject({ postMediaId: 'pm-a' });
    expect(draft.pages[0]?.background?.aspectRatio).toBe(1.5);
    expect(draft.pages[1]?.background?.mediaType).toBe('video');
    expect(draft.pages[0]?.sound?.upload).toMatchObject({ postMediaId: 'pm-c' });
    expect(currentStudioPage(draft).id).toBe('page-1');
  });
});

describe('studioEditHydration — ce que le studio ne sait pas porter n’est JAMAIS détruit (#9317)', () => {
  test('un post de TEXTE seul (ni canvas ni média) reste à la feuille de texte', () => {
    expect(hydrate(post({ storyEffects: null, media: [] }))).toEqual({ kind: 'unsupported', reason: 'text-only' });
  });

  test('un objet que le studio ne pose pas (autocollant) refuse l’hydratation', () => {
    const document = {
      v: 3,
      scenes: [{ id: 's', objects: [{ id: 'st', kind: 'sticker', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: {}, payload: { emoji: '🎉' } }] }],
    };
    expect(hydrate(post({ storyEffects: document }))).toEqual({ kind: 'unsupported', reason: 'object' });
  });

  test('deux calques sur une même scène refusent l’hydratation (le studio n’en porte qu’un)', () => {
    const media = (id: string) => ({ id, kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 2, transform: {}, payload: { postMediaId: id, mediaURL: `${id}.jpg` } });
    const document = { v: 3, scenes: [{ id: 's', objects: [media('pm-1'), media('pm-2')] }] };
    expect(hydrate(post({ storyEffects: document }))).toEqual({ kind: 'unsupported', reason: 'object' });
  });

  test('un média sans identité retrouvable refuse l’hydratation', () => {
    const document = {
      v: 3,
      scenes: [{ id: 's', objects: [{ id: 'm', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 0, transform: {}, payload: { mediaURL: 'inconnu.jpg', isBackground: true } }] }],
    };
    expect(hydrate(post({ storyEffects: document, media: [] }))).toEqual({ kind: 'unsupported', reason: 'object' });
  });

  test('une republication, une humeur, ou la publication d’un autre ne s’ouvrent pas dans le studio', () => {
    expect(hydrate(post({ repostOfId: 'p-0' }))).toEqual({ kind: 'unsupported', reason: 'repost' });
    expect(hydrate(post({ type: 'STATUS' }))).toEqual({ kind: 'unsupported', reason: 'kind' });
    expect(hydrate(post(), 'u-autre')).toEqual({ kind: 'unsupported', reason: 'not-author' });
  });
});
