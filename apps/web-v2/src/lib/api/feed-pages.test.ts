import { describe, expect, test } from 'bun:test';

import { flattenFeedPages, nextFeedCursor, type FeedInfiniteData, type FeedPage, type FeedPost } from './feed-pages';

const post = (id: string): FeedPost => ({ id, type: 'POST', createdAt: '2026-09-01T00:00:00.000Z' });

const page = (posts: readonly FeedPost[], pagination: FeedPage['pagination']): FeedPage => ({ posts, pagination });

describe('flattenFeedPages — dédoublonne, la PREMIÈRE occurrence gagne', () => {
  test('deux pages sans recouvrement s’aplatissent dans l’ordre', () => {
    const data: FeedInfiniteData = {
      pages: [page([post('a'), post('b')], { limit: 2, hasMore: true, nextCursor: 'c1' })],
      pageParams: [undefined],
    };
    expect(flattenFeedPages(data).map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('un id remonté deux fois n’apparaît qu’une seule fois, à sa PREMIÈRE place', () => {
    const data: FeedInfiniteData = {
      pages: [
        page([post('a'), post('b')], { limit: 2, hasMore: true, nextCursor: 'c1' }),
        page([post('b'), post('c')], { limit: 2, hasMore: false, nextCursor: null }),
      ],
      pageParams: [undefined, 'c1'],
    };
    expect(flattenFeedPages(data).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('nextFeedCursor — SIX vecteurs de garde « zéro progrès »', () => {
  const allPages = (lastPage: FeedPage): readonly FeedPage[] => [lastPage];

  test('hasMore=false ⇒ aucun curseur', () => {
    const last = page([post('a')], { limit: 20, hasMore: false, nextCursor: 'c1' });
    expect(nextFeedCursor(last, allPages(last), undefined)).toBeUndefined();
  });

  test('nextCursor absent (null) ⇒ aucun curseur, même hasMore vrai', () => {
    const last = page([post('a')], { limit: 20, hasMore: true, nextCursor: null });
    expect(nextFeedCursor(last, allPages(last), undefined)).toBeUndefined();
  });

  test('curseur STAGNANT (identique au paramètre qui vient de servir cette page) ⇒ aucun curseur', () => {
    const last = page([post('a')], { limit: 20, hasMore: true, nextCursor: 'c1' });
    expect(nextFeedCursor(last, allPages(last), 'c1')).toBeUndefined();
  });

  test('page VIDE ⇒ aucun curseur', () => {
    const last = page([], { limit: 20, hasMore: true, nextCursor: 'c2' });
    expect(nextFeedCursor(last, allPages(last), 'c1')).toBeUndefined();
  });

  test('aucun id NEUF dans la page qui vient d’arriver (page déjà vue reservie) ⇒ aucun curseur', () => {
    const priorPage = page([post('a'), post('b')], { limit: 20, hasMore: true, nextCursor: 'c1' });
    const lastPage = page([post('a'), post('b')], { limit: 20, hasMore: true, nextCursor: 'c2' });
    expect(nextFeedCursor(lastPage, [priorPage, lastPage], 'c1')).toBeUndefined();
  });

  test('progrès réel (curseur neuf, id neuf) ⇒ le curseur EST rendu', () => {
    const priorPage = page([post('a')], { limit: 20, hasMore: true, nextCursor: 'c1' });
    const lastPage = page([post('b')], { limit: 20, hasMore: true, nextCursor: 'c2' });
    expect(nextFeedCursor(lastPage, [priorPage, lastPage], 'c1')).toBe('c2');
  });
});
