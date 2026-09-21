import { describe, expect, test } from 'bun:test';

import type { FeedInfiniteData, FeedPost } from '@/lib/api/feed-pages';

import { resolveFeedCardModel } from './card-model';
import { applyMediaCaptionTranslation, mapCardPosts, togglePost, withServedCount, type PostToggle, type ServedCount } from './interactions';

const NOW = new Date('2026-09-13T12:00:00.000Z');

const post = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-09-13T11:55:00.000Z',
  ...partial,
});

/** Une loi de CARTE portée à travers les pages par le parcours unique — ce que
 * le registre des caisses (`lib/api/card-caches.ts`) applique à chaque écran. */
const applyPostToggle = (data: FeedInfiniteData | undefined, change: PostToggle) =>
  mapCardPosts(data, (post) => togglePost(post, change));
const applyServedCount = (data: FeedInfiniteData | undefined, served: ServedCount) =>
  mapCardPosts(data, (post) => withServedCount(post, served));

const pagesOf = (...pages: readonly (readonly FeedPost[])[]): FeedInfiniteData => ({
  pages: pages.map((posts) => ({ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } })),
  pageParams: pages.map(() => undefined),
});

/** Les quatre champs que les gestes écrivent — `toEqual` ignore ceux qui
 * valent `undefined`, donc un témoin ne nomme que ce qu'il affirme. */
const gestureStateOf = (data: FeedInfiniteData | undefined, id: string) => {
  const found = data?.pages.flatMap((page) => page.posts).find((p) => p.id === id);
  return found === undefined
    ? undefined
    : {
        isLikedByMe: found.isLikedByMe,
        likeCount: found.likeCount,
        isBookmarkedByMe: found.isBookmarkedByMe,
        bookmarkCount: found.bookmarkCount,
      };
};

describe('resolveFeedCardModel — l’état PROPRE AU LECTEUR voyage jusqu’à la carte', () => {
  test('`isLikedByMe` et `isBookmarkedByMe` servis deviennent `viewer.liked` / `viewer.bookmarked`', () => {
    const model = resolveFeedCardModel(post({ isLikedByMe: true, isBookmarkedByMe: false }), { preferredLanguages: ['fr'], now: NOW });
    expect(model.viewer).toEqual({ liked: true, bookmarked: false });
  });

  test('un état NON servi (`null`, absent) se lit « pas encore », jamais « inconnu » affiché plein', () => {
    const model = resolveFeedCardModel(post({ isLikedByMe: null }), { preferredLanguages: ['fr'], now: NOW });
    expect(model.viewer).toEqual({ liked: false, bookmarked: false });
  });
});

describe('togglePost × mapCardPosts — le geste optimiste, IMMUABLE, sur une caisse paginée', () => {
  test('aimer un post pas encore aimé ⇒ cœur plein ET compte +1', () => {
    const next = applyPostToggle(pagesOf([post({ isLikedByMe: false, likeCount: 14 })]), { postId: 'p1', kind: 'like', on: true });
    expect(gestureStateOf(next, 'p1')).toEqual({ isLikedByMe: true, likeCount: 15 });
  });

  test('retirer son « j’aime » ⇒ cœur vide ET compte −1, jamais sous zéro', () => {
    const once = applyPostToggle(pagesOf([post({ isLikedByMe: true, likeCount: 1 })]), { postId: 'p1', kind: 'like', on: false });
    expect(gestureStateOf(once, 'p1')).toEqual({ isLikedByMe: false, likeCount: 0 });

    const desync = applyPostToggle(pagesOf([post({ isLikedByMe: true, likeCount: 0 })]), { postId: 'p1', kind: 'like', on: false });
    expect(gestureStateOf(desync, 'p1')?.likeCount).toBe(0);
  });

  test('un compte non servi (`null`) part de zéro', () => {
    const next = applyPostToggle(pagesOf([post({ isLikedByMe: null, likeCount: null })]), { postId: 'p1', kind: 'like', on: true });
    expect(gestureStateOf(next, 'p1')).toEqual({ isLikedByMe: true, likeCount: 1 });
  });

  test('enregistrer bascule `isBookmarkedByMe` et `bookmarkCount`, sans toucher au « j’aime »', () => {
    const next = applyPostToggle(pagesOf([post({ isLikedByMe: true, likeCount: 7, isBookmarkedByMe: false, bookmarkCount: 2 })]), {
      postId: 'p1',
      kind: 'bookmark',
      on: true,
    });
    expect(gestureStateOf(next, 'p1')).toEqual({ isBookmarkedByMe: true, bookmarkCount: 3, isLikedByMe: true, likeCount: 7 });

    const undone = applyPostToggle(next, { postId: 'p1', kind: 'bookmark', on: false });
    expect(gestureStateOf(undone, 'p1')).toEqual({ isBookmarkedByMe: false, bookmarkCount: 2, isLikedByMe: true, likeCount: 7 });
  });

  /** Un double tap, ou une confirmation qui arrive après l'optimiste, ne
   * compte JAMAIS deux fois : le compte ne bouge que si l'état bascule. */
  test('demander l’état DÉJÀ tenu ne change rien — ni le compte, ni la référence du cache', () => {
    const data = pagesOf([post({ isLikedByMe: true, likeCount: 14 })]);
    expect(applyPostToggle(data, { postId: 'p1', kind: 'like', on: true })).toBe(data);
  });

  test('seul le post visé change de référence ; ses voisins et les autres pages restent `toBe`-identiques', () => {
    const neighbour = post({ id: 'p2', likeCount: 3 });
    const otherPagePost = post({ id: 'p3', likeCount: 9 });
    const data = pagesOf([post({ isLikedByMe: false, likeCount: 0 }), neighbour], [otherPagePost]);

    const next = applyPostToggle(data, { postId: 'p1', kind: 'like', on: true });
    expect(next?.pages[0]?.posts[1]).toBe(neighbour);
    expect(next?.pages[1]).toBe(data.pages[1]);
    expect(next?.pageParams).toBe(data.pageParams);
  });

  test('un post servi sur DEUX pages (curseur qui chevauche) bascule partout, pour que l’aplatissement ne montre jamais l’ancien', () => {
    const data = pagesOf([post({ isLikedByMe: false, likeCount: 4 })], [post({ isLikedByMe: false, likeCount: 4 })]);
    const next = applyPostToggle(data, { postId: 'p1', kind: 'like', on: true });
    expect(next?.pages.map((page) => page.posts[0]?.likeCount)).toEqual([5, 5]);
  });

  test('un cache vide ou un post absent rend le cache TEL QUEL', () => {
    expect(applyPostToggle(undefined, { postId: 'p1', kind: 'like', on: true })).toBeUndefined();
    const data = pagesOf([post({ id: 'autre' })]);
    expect(applyPostToggle(data, { postId: 'p1', kind: 'like', on: true })).toBe(data);
  });
});

describe('withServedCount × mapCardPosts — un compte SERVI remplace l’estimation, partage compris (#6278)', () => {
  test('le compte de partages servi entre au cache, sans toucher aux autres', () => {
    const next = applyServedCount(pagesOf([post({ shareCount: 2, likeCount: 5 })]), { postId: 'p1', kind: 'share', count: 7 });
    const found = next?.pages[0]?.posts[0];
    expect(found?.shareCount).toBe(7);
    expect(found?.likeCount).toBe(5);
  });

  test('un compte déjà juste ne change pas la référence du cache', () => {
    const data = pagesOf([post({ shareCount: 7 })]);
    expect(applyServedCount(data, { postId: 'p1', kind: 'share', count: 7 })).toBe(data);
  });
});

const translation = (text: string) => ({ text, translationModel: 'nllb-200', createdAt: '2026-09-14T00:00:00.000Z' });

describe('applyMediaCaptionTranslation — la légende d’un média suit le pipeline ZMQ EN DIRECT (#6280)', () => {
  test('une traduction reçue entre dans `captionTranslations`, à sa langue', () => {
    const data = pagesOf([
      post({ media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', caption: 'The market', captionLanguage: 'en' }] }),
    ]);
    const next = applyMediaCaptionTranslation(data, { mediaId: 'm1', language: 'fr', translation: translation('Le marché') });
    expect(next?.pages[0]?.posts[0]?.media?.[0]?.captionTranslations).toEqual({ fr: translation('Le marché') });
  });

  test('une SECONDE traduction pour la MÊME langue remplace la première, jamais un doublon', () => {
    const withFr = pagesOf([
      post({
        media: [
          {
            id: 'm1',
            mimeType: 'image/jpeg',
            fileUrl: 'a.jpg',
            caption: 'The market',
            captionTranslations: { fr: translation('Le marché') },
          },
        ],
      }),
    ]);
    const next = applyMediaCaptionTranslation(withFr, { mediaId: 'm1', language: 'fr', translation: translation('Le grand marché') });
    expect(next?.pages[0]?.posts[0]?.media?.[0]?.captionTranslations).toEqual({ fr: translation('Le grand marché') });
  });

  test('une traduction dans une AUTRE langue s’ajoute, sans écraser la précédente', () => {
    const withFr = pagesOf([
      post({
        media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', captionTranslations: { fr: translation('Le marché') } }],
      }),
    ]);
    const next = applyMediaCaptionTranslation(withFr, { mediaId: 'm1', language: 'de', translation: translation('Der Markt') });
    expect(next?.pages[0]?.posts[0]?.media?.[0]?.captionTranslations).toEqual({
      fr: translation('Le marché'),
      de: translation('Der Markt'),
    });
  });

  test('un média ABSENT du cache (commentaire, post non chargé) laisse le cache TEL QUEL, sans lever', () => {
    const data = pagesOf([post({ media: [{ id: 'autre', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }] })]);
    expect(applyMediaCaptionTranslation(data, { mediaId: 'm1', language: 'fr', translation: translation('Le marché') })).toBe(data);
    expect(applyMediaCaptionTranslation(undefined, { mediaId: 'm1', language: 'fr', translation: translation('x') })).toBeUndefined();
  });

  test('seul le post porteur du média change de référence ; ses voisins restent `toBe`-identiques', () => {
    const neighbour = post({ id: 'p2', media: [{ id: 'm2', mimeType: 'image/jpeg', fileUrl: 'b.jpg' }] });
    const data = pagesOf([post({ media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }] }), neighbour]);
    const next = applyMediaCaptionTranslation(data, { mediaId: 'm1', language: 'fr', translation: translation('Le marché') });
    expect(next?.pages[0]?.posts[1]).toBe(neighbour);
  });
});
