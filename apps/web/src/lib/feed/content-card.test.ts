import { describe, expect, test } from 'bun:test';

import type { FeedMedia, FeedPost } from '@/lib/api/feed-pages';
import { attachmentSrc } from '@/lib/api/media-url';

import { CONTENT_CARD_MEDIA_MAX_HEIGHT, CONTENT_CARD_PORTRAIT_MAX_HEIGHT, contentCardModelOf } from './content-card';

/**
 * **CE QUE LA CARTE D'UN CONTENU MONTRE (#19334, parapluie #19331)** — la
 * projection PURE d'une publication servie (`GET posts/:id`) vers la carte :
 * type, auteur, texte servi par le Prisme du lecteur, bloc média, compteurs.
 */

const NOW = new Date('2026-11-17T12:00:00.000Z');
const POST_ID = '66f0c0ffee0000000000c0de';
const ORIGINAL_ID = '66f0c0ffee0000000000beef';

const post = (overrides: Partial<FeedPost> = {}): FeedPost => ({
  id: POST_ID,
  type: 'POST',
  createdAt: '2026-11-17T09:00:00.000Z',
  content: 'Le marché du matin',
  originalLanguage: 'fr',
  author: { id: 'u-amani', username: 'amani', displayName: 'Amani Diallo', avatar: null },
  ...overrides,
});

const media = (overrides: Partial<FeedMedia> = {}): FeedMedia => ({
  id: 'm1',
  mimeType: 'image/jpeg',
  fileUrl: 'posts/m1.jpg',
  thumbnailUrl: 'posts/m1-thumb.jpg',
  width: 1200,
  height: 900,
  ...overrides,
});

const params = { preferredLanguages: ['fr'], now: NOW, linkType: null, language: 'fr' } as const;

describe('contentCardModelOf — l’en-tête : type, auteur, heure', () => {
  test('le type servi, le nom affiché, l’heure relative courte', () => {
    const model = contentCardModelOf(post({ type: 'REEL' }), params);
    expect(model.type).toBe('REEL');
    expect(model.routeType).toBe('REEL');
    expect(model.author.name).toBe('Amani Diallo');
    expect(model.author.initials).toBe('AD');
    expect(model.relativeTime).toBe('3h');
  });

  test('sans nom affiché, le pseudo précédé de @', () => {
    const model = contentCardModelOf(post({ author: { id: 'u-amani', username: 'amani', displayName: '  ', avatar: null } }), params);
    expect(model.author.name).toBe('@amani');
  });

  test('un type inconnu de la passerelle : la porte suit l’adresse, la pastille dit « publication »', () => {
    expect(contentCardModelOf(post({ type: 'ARTICLE' }), { ...params, linkType: 'STORY' }).routeType).toBe('STORY');
    expect(contentCardModelOf(post({ type: 'ARTICLE' }), params).routeType).toBeNull();
    expect(contentCardModelOf(post({ type: 'ARTICLE' }), params).type).toBe('POST');
  });
});

describe('contentCardModelOf — le texte servi par le Prisme du lecteur', () => {
  test('descend jusqu’au rang 2 du Prisme, jamais un repli sur l’original', () => {
    const model = contentCardModelOf(
      post({ content: 'Buenos días a todos', originalLanguage: 'es', translations: { en: { text: 'Good morning everyone' } } }),
      { ...params, preferredLanguages: ['fr', 'en'] },
    );
    expect(model.text).toEqual({ full: 'Good morning everyone', language: 'en', originalLanguage: 'es' });
  });

  test('un texte vide n’a pas de texte', () => {
    expect(contentCardModelOf(post({ content: '   ' }), params).text).toBeUndefined();
  });

  test('une humeur porte son émoji ; un autre contenu, jamais', () => {
    expect(contentCardModelOf(post({ type: 'STATUS', moodEmoji: '🌞', content: 'Grand soleil' }), params).moodEmoji).toBe('🌞');
    expect(contentCardModelOf(post({ type: 'POST', moodEmoji: '🌞' }), params).moodEmoji).toBeUndefined();
  });

  test('le texte servi est rogné de ses blancs de bord', () => {
    expect(contentCardModelOf(post({ content: '\n  Le marché du matin  \n' }), params).text?.full).toBe('Le marché du matin');
  });
});

describe('contentCardModelOf — le bloc média', () => {
  test('une image : sa vignette, son placeholder, son rapport d’aspect, « +N » pour les médias en plus', () => {
    const model = contentCardModelOf(post({ media: [media({ thumbHash: '1QcSHQRnh493V4dIh4eXh1h4kJUI' }), media({ id: 'm2' }), media({ id: 'm3' })] }), params);
    expect(model.media).toMatchObject({ kind: 'image', src: attachmentSrc('posts/m1-thumb.jpg'), more: 2, aspectRatio: 4 / 3, maxHeight: CONTENT_CARD_MEDIA_MAX_HEIGHT });
    expect(model.media?.placeholder?.startsWith('data:image/svg+xml')).toBe(true);
  });

  test('une image sans vignette sert son propre fichier', () => {
    expect(contentCardModelOf(post({ media: [media({ thumbnailUrl: null })] }), params).media?.src).toBe(attachmentSrc('posts/m1.jpg'));
  });

  test('le rapport d’aspect est borné entre 4:5 et 16:9 ; sans dimensions servies, 4:3', () => {
    expect(contentCardModelOf(post({ media: [media({ width: 400, height: 1000 })] }), params).media?.aspectRatio).toBe(4 / 5);
    expect(contentCardModelOf(post({ media: [media({ width: 3000, height: 1000 })] }), params).media?.aspectRatio).toBe(16 / 9);
    expect(contentCardModelOf(post({ media: [media({ width: null, height: null })] }), params).media?.aspectRatio).toBe(4 / 3);
  });

  test('une vidéo : sa vignette et sa durée ; sans vignette, aucune source (le fichier d’une vidéo n’est pas une image)', () => {
    const video = media({ mimeType: 'video/mp4', fileUrl: 'posts/v1.mp4', thumbnailUrl: 'posts/v1.jpg', duration: 42_000 });
    expect(contentCardModelOf(post({ media: [video] }), params).media).toMatchObject({ kind: 'video', src: attachmentSrc('posts/v1.jpg'), durationMs: 42_000, more: 0 });
    expect(contentCardModelOf(post({ media: [{ ...video, thumbnailUrl: null }] }), params).media?.src).toBeUndefined();
  });

  test('un réel ou une story : un portrait 9:16, plus haut', () => {
    const portrait = contentCardModelOf(post({ type: 'STORY', media: [media()] }), params).media;
    expect(portrait).toMatchObject({ aspectRatio: 9 / 16, maxHeight: CONTENT_CARD_PORTRAIT_MAX_HEIGHT });
  });

  test('sans média visuel (un vocal seul), aucun bloc média', () => {
    expect(contentCardModelOf(post({ media: [media({ mimeType: 'audio/mp4', thumbnailUrl: null })] }), params).media).toBeUndefined();
    expect(contentCardModelOf(post(), params).media).toBeUndefined();
  });

  test('le premier média VISUEL fait le bloc, « +N » compte tous les autres', () => {
    const voice = media({ id: 'a1', mimeType: 'audio/mp4', thumbnailUrl: null, order: 0 });
    const picture = media({ id: 'm2', thumbnailUrl: 'posts/m2.jpg', order: 1 });
    expect(contentCardModelOf(post({ media: [picture, voice] }), params).media).toMatchObject({ src: attachmentSrc('posts/m2.jpg'), more: 1 });
  });
});

describe('contentCardModelOf — les compteurs et le favori du lecteur', () => {
  test('vues, j’aime, commentaires, favoris ; un compteur absent vaut zéro', () => {
    const model = contentCardModelOf(post({ viewCount: 1234, likeCount: 12, commentCount: null, bookmarkCount: 4 }), params);
    expect(model.stats).toEqual({ views: 1234, likes: 12, comments: 0, favorites: 4 });
    expect(model.bookmarked).toBe(false);
  });

  test('le favori du lecteur se lit tel que la passerelle le sert', () => {
    expect(contentCardModelOf(post({ isBookmarkedByMe: true }), params).bookmarked).toBe(true);
  });
});

describe('contentCardModelOf — une republication nue montre l’original', () => {
  const repost = post({
    content: null,
    media: [],
    repostOf: {
      id: ORIGINAL_ID,
      type: 'REEL',
      content: 'La danse du soir',
      originalLanguage: 'fr',
      createdAt: '2026-11-16T12:00:00.000Z',
      author: { id: 'u-kofi', username: 'kofi', displayName: 'Kofi' },
      media: [media({ mimeType: 'video/mp4', thumbnailUrl: 'posts/r1.jpg', duration: 9_000 })],
    },
    viewCount: 30,
    bookmarkCount: 2,
  });

  test('auteur, texte et média de l’original ; le type, la porte et les compteurs restent ceux de la publication désignée', () => {
    const model = contentCardModelOf(repost, params);
    expect(model.author.name).toBe('Kofi');
    expect(model.text?.full).toBe('La danse du soir');
    expect(model.media).toMatchObject({ kind: 'video', src: attachmentSrc('posts/r1.jpg'), aspectRatio: 9 / 16 });
    expect(model.relativeTime).toBe('1j');
    expect(model.postId).toBe(POST_ID);
    expect(model.type).toBe('POST');
    expect(model.routeType).toBe('POST');
    expect(model.stats.views).toBe(30);
  });

  test('une republication qui porte son propre texte reste elle-même', () => {
    const quoted = contentCardModelOf({ ...repost, content: 'Regardez ça' }, params);
    expect(quoted.author.name).toBe('Amani Diallo');
    expect(quoted.text?.full).toBe('Regardez ça');
  });
});
