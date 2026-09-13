import { describe, expect, test } from 'bun:test';

import {
  FEED_POSTS,
  POST_CAROUSEL,
  POST_IMAGE_EN_TRANSLATED,
  POST_LONG_TEXT,
  POST_NO_DIMENSIONS,
  POST_REPOST,
  POST_TEXT_RANK2,
  POST_WIRE_NULLS,
  REEL_PORTRAIT,
  pageOfFeed,
} from './fixtures-feed';
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

  test('POST_REPOST porte l’attribution de republication', () => {
    expect(POST_REPOST.repostOf?.author?.username).toBe('yann.petit');
  });

  test('REEL_PORTRAIT est un REEL vidéo en portrait, dimensionné', () => {
    expect(REEL_PORTRAIT.type).toBe('REEL');
    const media = REEL_PORTRAIT.media?.[0];
    expect(media?.mimeType).toBe('video/mp4');
    expect(media?.height).toBeGreaterThan(media?.width ?? 0);
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
