import { describe, expect, test } from 'bun:test';

import type { FeedInfiniteData, FeedPost } from '@/lib/api/feed-pages';

import { bookmarkSlotOf, withBookmark, withoutBookmark } from './bookmark-membership';

/**
 * **LE CORPUS DES ENREGISTRÉES EST UNE APPARTENANCE, PAS UN DRAPEAU** (#7286).
 *
 * `applyPostToggle` sait basculer `isBookmarkedByMe` là où la publication est
 * DÉJÀ servie — c'est juste pour le Flux, les Réels et la fiche, où retirer un
 * signet laisse la carte en place, éteinte. Sur l'écran des enregistrées, la
 * même bascule rendrait une ligne QUI N'A PLUS DE RAISON D'Y ÊTRE : le corpus
 * est défini par l'appartenance, pas par un champ.
 *
 * D'où ces trois fonctions PURES, exercées sans réseau ni DOM. Le retour en
 * arrière REND SA PLACE à la ligne : la liste est ordonnée par date
 * d'enregistrement, et une restauration en tête mentirait sur cet ordre.
 */

const post = (id: string): FeedPost => ({
  id,
  type: 'POST',
  createdAt: '2026-09-21T10:00:00.000Z',
  isBookmarkedByMe: true,
});

const pages = (...groups: readonly (readonly FeedPost[])[]): FeedInfiniteData => ({
  pages: groups.map((posts) => ({ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } })),
  pageParams: groups.map(() => undefined),
});

const idsOf = (data: FeedInfiniteData | undefined): readonly (readonly string[])[] =>
  (data?.pages ?? []).map((page) => page.posts.map((p) => p.id));

describe('bookmarkSlotOf — où vit cette publication dans le corpus enregistré', () => {
  test('rend la page ET l’index, pas seulement la publication', () => {
    const data = pages([post('a'), post('b')], [post('c')]);

    expect(bookmarkSlotOf(data, 'c')).toEqual({ post: post('c'), page: 1, index: 0 });
    expect(bookmarkSlotOf(data, 'b')).toEqual({ post: post('b'), page: 0, index: 1 });
  });

  test('rend `null` pour une publication absente, et pour un cache vide', () => {
    expect(bookmarkSlotOf(pages([post('a')]), 'zz')).toBeNull();
    expect(bookmarkSlotOf(undefined, 'a')).toBeNull();
  });
});

describe('withoutBookmark — retirer ÔTE la ligne, jamais ne l’éteint', () => {
  test('la publication disparaît de sa page', () => {
    const data = pages([post('a'), post('b')], [post('c')]);

    expect(idsOf(withoutBookmark(data, 'b'))).toEqual([['a'], ['c']]);
  });

  test('un doublon servi sur DEUX pages part des deux', () => {
    const data = pages([post('a'), post('b')], [post('b'), post('c')]);

    expect(idsOf(withoutBookmark(data, 'b'))).toEqual([['a'], ['c']]);
  });

  test('un cache vide reste vide — jamais une caisse fabriquée à partir de rien', () => {
    expect(withoutBookmark(undefined, 'a')).toBeUndefined();
  });

  test('une publication absente rend la MÊME référence — aucun rendu inutile', () => {
    const data = pages([post('a')]);

    expect(withoutBookmark(data, 'zz')).toBe(data);
  });
});

describe('withBookmark — remettre REND SA PLACE', () => {
  test('le retour en arrière d’un retrait réinsère à l’index d’origine', () => {
    const data = pages([post('a'), post('b'), post('c')]);
    const slot = bookmarkSlotOf(data, 'b');
    const retire = withoutBookmark(data, 'b');

    expect(idsOf(retire)).toEqual([['a', 'c']]);
    expect(slot).not.toBeNull();
    expect(idsOf(withBookmark(retire, slot!))).toEqual([['a', 'b', 'c']]);
  });

  test('la place est rendue sur SA page, pas sur la première', () => {
    const data = pages([post('a')], [post('b'), post('c')]);
    const slot = bookmarkSlotOf(data, 'c');

    expect(idsOf(withBookmark(withoutBookmark(data, 'c'), slot!))).toEqual([['a'], ['b', 'c']]);
  });

  test('un enregistrement NEUF se pose en tête : c’est le plus récent', () => {
    const data = pages([post('a'), post('b')]);

    expect(idsOf(withBookmark(data, { post: post('z'), page: 0, index: 0 }))).toEqual([['z', 'a', 'b']]);
  });

  test('la ligne posée PORTE son signet — une ligne éteinte dans la liste des enregistrées serait un mensonge', () => {
    const data = pages([post('a')]);
    const eteint: FeedPost = { ...post('z'), isBookmarkedByMe: false };

    const rendu = withBookmark(data, { post: eteint, page: 0, index: 0 });
    expect(rendu?.pages[0]?.posts[0]?.isBookmarkedByMe).toBe(true);
  });

  test('une publication DÉJÀ présente n’est pas doublée', () => {
    const data = pages([post('a'), post('b')]);

    expect(withBookmark(data, { post: post('b'), page: 0, index: 0 })).toBe(data);
  });

  test('une page hors bornes se pose en tête plutôt que de PERDRE la ligne', () => {
    const data = pages([post('a')]);

    expect(idsOf(withBookmark(data, { post: post('z'), page: 7, index: 3 }))).toEqual([['z', 'a']]);
  });

  test('un cache vide reste vide — le corpus se charge, il ne s’invente pas', () => {
    expect(withBookmark(undefined, { post: post('z'), page: 0, index: 0 })).toBeUndefined();
  });
});
