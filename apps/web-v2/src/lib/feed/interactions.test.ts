import { describe, expect, test } from 'bun:test';

import type { FeedInfiniteData, FeedPost } from '@/lib/api/feed-pages';

import { resolveFeedCardModel } from './card-model';
import { applyPostToggle } from './interactions';

const NOW = new Date('2026-09-13T12:00:00.000Z');

const post = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-09-13T11:55:00.000Z',
  ...partial,
});

const pagesOf = (...pages: readonly (readonly FeedPost[])[]): FeedInfiniteData => ({
  pages: pages.map((posts) => ({ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } })),
  pageParams: pages.map(() => undefined),
});

const postIn = (data: FeedInfiniteData | undefined, id: string): FeedPost | undefined =>
  data?.pages.flatMap((page) => page.posts).find((p) => p.id === id);

describe('resolveFeedCardModel — l’état PROPRE AU LECTEUR voyage jusqu’à la carte', () => {
  test('`isLiked` et `isBookmarkedByMe` servis deviennent `viewer.liked` / `viewer.bookmarked`', () => {
    const model = resolveFeedCardModel(post({ isLiked: true, isBookmarkedByMe: false }), { preferredLanguages: ['fr'], now: NOW });
    expect(model.viewer).toEqual({ liked: true, bookmarked: false });
  });

  test('un état NON servi (`null`, absent) se lit « pas encore », jamais « inconnu » affiché plein', () => {
    const model = resolveFeedCardModel(post({ isLiked: null }), { preferredLanguages: ['fr'], now: NOW });
    expect(model.viewer).toEqual({ liked: false, bookmarked: false });
  });
});

describe('applyPostToggle — le geste optimiste, IMMUABLE, sur le cache paginé du fil', () => {
  test('aimer un post pas encore aimé ⇒ cœur plein ET compte +1', () => {
    const next = applyPostToggle(pagesOf([post({ isLiked: false, likeCount: 14 })]), { postId: 'p1', kind: 'like', on: true });
    expect(postIn(next, 'p1')).toMatchObject({ isLiked: true, likeCount: 15 });
  });

  test('retirer son « j’aime » ⇒ cœur vide ET compte −1, jamais sous zéro', () => {
    const once = applyPostToggle(pagesOf([post({ isLiked: true, likeCount: 1 })]), { postId: 'p1', kind: 'like', on: false });
    expect(postIn(once, 'p1')).toMatchObject({ isLiked: false, likeCount: 0 });

    const desync = applyPostToggle(pagesOf([post({ isLiked: true, likeCount: 0 })]), { postId: 'p1', kind: 'like', on: false });
    expect(postIn(desync, 'p1')?.likeCount).toBe(0);
  });

  test('un compte non servi (`null`) part de zéro', () => {
    const next = applyPostToggle(pagesOf([post({ isLiked: null, likeCount: null })]), { postId: 'p1', kind: 'like', on: true });
    expect(postIn(next, 'p1')).toMatchObject({ isLiked: true, likeCount: 1 });
  });

  test('enregistrer bascule `isBookmarkedByMe` et `bookmarkCount`, sans toucher au « j’aime »', () => {
    const next = applyPostToggle(pagesOf([post({ isLiked: true, likeCount: 7, isBookmarkedByMe: false, bookmarkCount: 2 })]), {
      postId: 'p1',
      kind: 'bookmark',
      on: true,
    });
    expect(postIn(next, 'p1')).toMatchObject({ isBookmarkedByMe: true, bookmarkCount: 3, isLiked: true, likeCount: 7 });

    const undone = applyPostToggle(next, { postId: 'p1', kind: 'bookmark', on: false });
    expect(postIn(undone, 'p1')).toMatchObject({ isBookmarkedByMe: false, bookmarkCount: 2 });
  });

  /** Un double tap, ou un rejeu après une réponse déjà appliquée, ne compte
   * JAMAIS deux fois : le compte ne bouge que si l'état bascule vraiment. */
  test('demander l’état DÉJÀ tenu ne change rien — ni le compte, ni la référence du cache', () => {
    const data = pagesOf([post({ isLiked: true, likeCount: 14 })]);
    expect(applyPostToggle(data, { postId: 'p1', kind: 'like', on: true })).toBe(data);
  });

  test('seul le post visé change de référence ; ses voisins et les autres pages restent `toBe`-identiques', () => {
    const neighbour = post({ id: 'p2', likeCount: 3 });
    const otherPagePost = post({ id: 'p3', likeCount: 9 });
    const data = pagesOf([post({ isLiked: false, likeCount: 0 }), neighbour], [otherPagePost]);

    const next = applyPostToggle(data, { postId: 'p1', kind: 'like', on: true });
    expect(next?.pages[0]?.posts[1]).toBe(neighbour);
    expect(next?.pages[1]).toBe(data.pages[1]);
    expect(next?.pageParams).toBe(data.pageParams);
  });

  test('un post servi sur DEUX pages (curseur qui chevauche) bascule partout, pour que l’aplatissement ne montre jamais l’ancien', () => {
    const data = pagesOf([post({ isLiked: false, likeCount: 4 })], [post({ isLiked: false, likeCount: 4 })]);
    const next = applyPostToggle(data, { postId: 'p1', kind: 'like', on: true });
    expect(next?.pages.map((page) => page.posts[0]?.likeCount)).toEqual([5, 5]);
  });

  test('un cache vide ou un post absent rend le cache TEL QUEL', () => {
    expect(applyPostToggle(undefined, { postId: 'p1', kind: 'like', on: true })).toBeUndefined();
    const data = pagesOf([post({ id: 'autre' })]);
    expect(applyPostToggle(data, { postId: 'p1', kind: 'like', on: true })).toBe(data);
  });
});
