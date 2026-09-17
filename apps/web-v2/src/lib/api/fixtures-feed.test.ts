import { describe, expect, test } from 'bun:test';

import { hasTimedObjects } from '@/lib/canvas/timeline';

import {
  FEED_POSTS,
  POST_CAROUSEL,
  POST_HERO,
  POST_IMAGE_EN_TRANSLATED,
  POST_LONG_TEXT,
  POST_NO_DIMENSIONS,
  POST_REPOST,
  POST_SCENE_CLIP_A,
  POST_SCENE_CLIP_B,
  POST_SCENE_DECORATED,
  POST_SCENE_TEXT,
  POST_SCENES_MIXED,
  POST_SCENES_WAVE,
  POST_TEXT_RANK2,
  POST_WIRE_NULLS,
  REEL_PORTRAIT,
  pageOfFeed,
} from './fixtures-feed';
import { carrierMediaIdentity } from '@/lib/canvas/carrier';
import { parseCanvasDocument } from '@/lib/canvas/document';
import { feedMediaKindOf } from '@/lib/feed/layout';
import { resolveMosaicLayout } from '@/lib/feed/mosaic-layout';
import { isDocumentAudible } from '@/lib/feed/scene-motion';
import { wordCountOf } from '@/lib/feed/text';

describe('FEED_POSTS — le corpus exerce chaque famille du § 3.4', () => {
  test('au moins 24 posts, de quoi observer une page 1 (20) et une page 2', () => {
    expect(FEED_POSTS.length).toBeGreaterThanOrEqual(24);
  });

  test('chaque id est UNIQUE — un doublon casserait le dédoublonnage de flattenFeedPages', () => {
    expect(new Set(FEED_POSTS.map((p) => p.id)).size).toBe(FEED_POSTS.length);
  });

  test('POST_TEXT_RANK2 porte une traduction UNIQUEMENT pour un rang ≠ 1 (leçon 261)', () => {
    expect(POST_TEXT_RANK2.originalLanguage).toBe('es');
    const translations = POST_TEXT_RANK2.translations as Record<string, { readonly text: string }>;
    expect(Object.keys(translations)).toEqual(['en']);
    expect(typeof translations.en?.text).toBe('string');
  });

  test('POST_LONG_TEXT dépasse le seuil de troncature de 20 mots', () => {
    expect(wordCountOf(POST_LONG_TEXT.content ?? '')).toBeGreaterThan(20);
  });

  test('POST_CAROUSEL porte trois médias ORDONNÉS, chacun sa légende', () => {
    expect(POST_CAROUSEL.media).toHaveLength(3);
    const orders = (POST_CAROUSEL.media ?? []).map((m) => m.order);
    expect(orders).toEqual([0, 1, 2]);
    for (const media of POST_CAROUSEL.media ?? []) expect(media.caption).toBeDefined();
  });

  test('POST_HERO porte trois photos et l’agencement `hero` choisi par son auteur (#6514)', () => {
    expect(POST_HERO.media).toHaveLength(3);
    expect(resolveMosaicLayout(POST_HERO.storyEffects)).toBe('hero');
  });

  test('POST_REPOST porte l’attribution de republication', () => {
    expect(POST_REPOST.repostOf?.author?.username).toBe('yann.petit');
  });

  test('REEL_PORTRAIT est un REEL vidéo en portrait, dimensionné', () => {
    expect(REEL_PORTRAIT.type).toBe('REEL');
    const media = REEL_PORTRAIT.media?.[0];
    expect(media?.mimeType?.startsWith('video/')).toBe(true);
    expect(media?.fileUrl.startsWith('data:video/webm;base64,')).toBe(true);
    expect(media?.height).toBeGreaterThan(media?.width ?? 0);
  });

  /**
   * **LE FIL DOIT PORTER DE QUOI JOUER** (#6807, volet médias).
   *
   * `FeedMediaSurface` monte un `<video>` ou un `<audio>` dès que son hôte le
   * déclare `playable` (#6800, gardé par `components/feed-media-surface.test.tsx`)
   * — mais le corpus ne porte AUCUN son et une seule vidéo, celle de
   * `REEL_PORTRAIT`, dont la décision #6457 veut justement qu'elle reste une
   * affiche IMMOBILE dans le fil. Mesuré au navigateur le 2026-09-16 sur le
   * serveur de développement : `/feed` monte 13 `<img>`, zéro `<video>`, zéro
   * `<audio>`.
   *
   * La règle de #6800 est donc juste, testée, et exercée par aucune recette.
   * Ce témoin garde la DONNÉE : le rendu a déjà les siens.
   */
  test('un post VIDÉO et un post SONORE existent — hors REEL, dont l’affiche reste immobile dans le fil (#6457)', () => {
    const mediasDePost = FEED_POSTS.filter((post) => post.type === 'POST').flatMap((post) => post.media ?? []);
    const familles = mediasDePost.map((media) => feedMediaKindOf(media.mimeType));

    expect(familles.filter((famille) => famille === 'video').length).toBeGreaterThanOrEqual(1);
    expect(familles.filter((famille) => famille === 'audio').length).toBeGreaterThanOrEqual(1);

    const video = mediasDePost.find((media) => feedMediaKindOf(media.mimeType) === 'video');
    const son = mediasDePost.find((media) => feedMediaKindOf(media.mimeType) === 'audio');
    expect(video?.fileUrl ?? '(aucune vidéo de post)').toMatch(/^data:video\//);
    expect(son?.fileUrl ?? '(aucun son de post)').toMatch(/^data:audio\//);
  });

  test('POST_NO_DIMENSIONS porte un média SANS largeur ni hauteur', () => {
    const media = POST_NO_DIMENSIONS.media?.[0];
    expect(media?.width).toBeUndefined();
    expect(media?.height).toBeUndefined();
  });

  /** Le corpus doit porter la FORME du fil réel, `null` compris — sans quoi
   * un défaut de nullité traverse tous les témoins (revue-correction #5893). */
  test('POST_WIRE_NULLS porte des `null`, pas des clés absentes — la forme que la passerelle sert', () => {
    expect(POST_WIRE_NULLS.author?.avatar).toBeNull();
    const media = POST_WIRE_NULLS.media?.[0];
    expect(media?.thumbnailUrl).toBeNull();
    expect(media?.thumbHash).toBeNull();
    expect(media?.caption).toBeNull();
    expect(media?.width).toBeNull();
    expect(media?.duration).toBeNull();
    expect(POST_WIRE_NULLS.likeCount).toBeNull();
  });

  test('POST_IMAGE_EN_TRANSLATED est servi en français au rang 1', () => {
    expect(POST_IMAGE_EN_TRANSLATED.originalLanguage).toBe('en');
    const translations = POST_IMAGE_EN_TRANSLATED.translations as Record<string, { readonly text: string }>;
    expect(Object.keys(translations)).toEqual(['fr']);
    expect(typeof translations.fr?.text).toBe('string');
  });
});

describe('pageOfFeed — mime le keyset (createdAt desc, id desc)', () => {
  test('page 1 : exactement `limit` lignes, triées du plus récent au plus ancien', () => {
    const p1 = pageOfFeed(FEED_POSTS, { limit: 20 });
    expect(p1.posts).toHaveLength(20);
    expect(p1.pagination.hasMore).toBe(true);
    expect(p1.pagination.nextCursor).not.toBeNull();
    const times = p1.posts.map((post) => new Date(post.createdAt).getTime());
    for (let i = 1; i < times.length; i += 1) expect(times[i]!).toBeLessThanOrEqual(times[i - 1]!);
  });

  test('un curseur INCONNU laisse la fenêtre INTACTE — reserre la page 1', () => {
    const fresh = pageOfFeed(FEED_POSTS, { limit: 20 });
    const withBogusCursor = pageOfFeed(FEED_POSTS, { cursor: 'inconnu', limit: 20 });
    expect(withBogusCursor.posts.map((p) => p.id)).toEqual(fresh.posts.map((p) => p.id));
  });

  test('la page 2 ne recoupe JAMAIS la page 1, et la traversée du corpus termine', () => {
    const p1 = pageOfFeed(FEED_POSTS, { limit: 20 });
    expect(p1.pagination.nextCursor).not.toBeNull();
    const p2 = pageOfFeed(FEED_POSTS, { cursor: p1.pagination.nextCursor!, limit: 20 });
    const idsP1 = new Set(p1.posts.map((p) => p.id));
    for (const post of p2.posts) expect(idsP1.has(post.id)).toBe(false);
    expect(p2.pagination.hasMore).toBe(false);
    expect(p2.pagination.nextCursor).toBeNull();
    expect(idsP1.size + p2.posts.length).toBe(FEED_POSTS.length);
  });
});

/**
 * T15 (#6898) — LE CORPUS PORTE DES SCÈNES. Chaque assertion mesure une
 * PROPRIÉTÉ que le § 3.4 de la spécification `scenes-fil` réclame — jamais
 * juste « l'id existe ».
 */
describe('le corpus du fil porte des scènes (§ 3.4)', () => {
  test('les cinq ids existent dans FEED_POSTS', () => {
    const ids = new Set(FEED_POSTS.map((p) => p.id));
    for (const id of ['post-scene-text', 'post-scenes-mixed', 'post-scenes-wave', 'post-scene-clip-a', 'post-scene-clip-b']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  test('post-scene-text : une traduction UNIQUEMENT pour un rang ≠ 1 (leçon 261)', () => {
    const doc = parseCanvasDocument(POST_SCENE_TEXT.storyEffects);
    const text = doc?.scenes[0]?.objects.find((o) => o.kind === 'text');
    expect(text?.locale).toBe('es');
    const translations = text?.payload.translations as Record<string, string> | undefined;
    expect(translations?.fr).toBeUndefined();
    expect(translations?.en).toBe('The scene speaks for itself.');
  });

  test('post-scenes-mixed : s2 n’adresse aucun média', () => {
    const doc = parseCanvasDocument(POST_SCENES_MIXED.storyEffects);
    expect(doc?.scenes.length).toBe(3);
    expect(carrierMediaIdentity(doc!.scenes[1]!)).toBeNull();
    expect(carrierMediaIdentity(doc!.scenes[0]!)).toBe('media-scene-pano');
    expect(carrierMediaIdentity(doc!.scenes[2]!)).toBe('media-scene-portrait');
  });

  test('post-scenes-wave : 5 scènes, layout wave', () => {
    const doc = parseCanvasDocument(POST_SCENES_WAVE.storyEffects);
    expect(doc?.scenes.length).toBe(5);
    expect(doc?.layout).toBe('wave');
  });

  test('post-scene-clip-a est audible, -b ne l’est pas', () => {
    const a = parseCanvasDocument(POST_SCENE_CLIP_A.storyEffects);
    const b = parseCanvasDocument(POST_SCENE_CLIP_B.storyEffects);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(isDocumentAudible(a!)).toBe(true);
    expect(isDocumentAudible(b!)).toBe(false);
  });

  test('tous les cinq sont datés à moins de 70 minutes (avant le premier remplissage)', () => {
    for (const id of ['post-scene-text', 'post-scenes-mixed', 'post-scenes-wave', 'post-scene-clip-a', 'post-scene-clip-b']) {
      const post = FEED_POSTS.find((p) => p.id === id);
      expect(post).toBeDefined();
      expect(Date.now() - new Date(post!.createdAt).getTime()).toBeLessThan(70 * 60_000);
    }
  });
});

// T-F (#6901) — POST_SCENE_DECORATED exerce les six kinds.
describe('POST_SCENE_DECORATED — les six couches d’un coup (T-F)', () => {
  test('parseCanvasDocument la lit ; les six kinds visibles sont présents', () => {
    const doc = parseCanvasDocument(POST_SCENE_DECORATED.storyEffects);
    expect(doc).not.toBeNull();
    const kinds = new Set(doc!.scenes[0]!.objects.map((o) => o.kind));
    expect(kinds).toEqual(new Set(['media', 'text', 'sticker', 'place', 'drawing']));
  });

  test('hasTimedObjects est vrai (le texte porte des keyframes)', () => {
    const doc = parseCanvasDocument(POST_SCENE_DECORATED.storyEffects);
    expect(hasTimedObjects(doc!.scenes[0]!)).toBe(true);
  });

  test('elle est dans NAMED_POSTS (FEED_POSTS)', () => {
    expect(FEED_POSTS.some((p) => p.id === 'post-scene-decorated')).toBe(true);
  });

  test('createdAt est strictement plus récent que le premier post de remplissage', () => {
    const decorated = FEED_POSTS.find((p) => p.id === 'post-scene-decorated')!;
    const firstFiller = FEED_POSTS.find((p) => p.id === 'post-filler-01')!;
    expect(new Date(decorated.createdAt).getTime()).toBeGreaterThan(new Date(firstFiller.createdAt).getTime());
  });
});
