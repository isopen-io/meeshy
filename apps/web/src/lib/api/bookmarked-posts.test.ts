import { describe, expect, test } from 'bun:test';

import {
  bookmarkedPostsInfiniteOptions,
  BOOKMARKS_PAGE_SIZE,
  BOOKMARKS_QUERY_KEY,
  loadBookmarkedPostsPage,
} from './bookmarked-posts';
import type { FeedPost } from './feed-pages';
import type { HttpTransport } from './http';

/**
 * **LE PORT DES PUBLICATIONS ENREGISTRÉES** (#7286) — `scope=bookmarks`, la
 * porte que la passerelle sert depuis #4149 et que le web n'avait jamais
 * ouverte.
 *
 * Deux affirmations, et la seconde casse en silence : le curseur est OPAQUE
 * (keyset `createdAt + id` de `PostBookmark`, `PostFeedService.getBookmarks`),
 * exactement comme celui de l'auteur — PAS le décalage entier du hashtag. Le
 * lire comme un nombre rendrait `cursor=NaN` et une seconde page identique à
 * la première.
 */

const post = (id: string): FeedPost => ({ id, type: 'POST', createdAt: '2026-09-01T10:00:00.000Z' });

type Call = { readonly path: string; readonly headers?: Readonly<Record<string, string>> };

const recordingTransport = (
  reply:
    | { readonly ok: true; readonly status: number; readonly data: unknown; readonly pagination?: unknown }
    | { readonly ok: false; readonly status: number; readonly error: string },
): { readonly transport: HttpTransport; readonly calls: Call[] } => {
  const calls: Call[] = [];
  const transport = {
    request: async (options: Call) => {
      calls.push(options);
      return reply;
    },
  } as unknown as HttpTransport;
  return { transport, calls };
};

const OK = {
  ok: true as const,
  status: 200,
  data: [post('p1')],
  pagination: { limit: 20, hasMore: true, nextCursor: 'k2', form: 'keyset' },
};

describe('loadBookmarkedPostsPage', () => {
  test('la requête porte `scope=bookmarks`, la limite et `X-Canvas-Caps: 3`', async () => {
    const { transport, calls } = recordingTransport(OK);
    await loadBookmarkedPostsPage({ source: 'gateway', transport });
    expect(calls[0]?.path).toBe(`/api/v1/social/posts?scope=bookmarks&limit=${BOOKMARKS_PAGE_SIZE}`);
    expect(calls[0]?.headers).toEqual({ 'X-Canvas-Caps': '3' });
  });

  test('le curseur est transmis TEL QUEL — une chaîne opaque, jamais un nombre', async () => {
    const { transport, calls } = recordingTransport(OK);
    await loadBookmarkedPostsPage({ source: 'gateway', transport, cursor: 'MjAyNi0wOS0wMXxwMQ==' });
    expect(calls[0]?.path).toContain('cursor=MjAyNi0wOS0wMXxwMQ%3D%3D');
    expect(calls[0]?.path).not.toContain('NaN');
  });

  test('la page servie porte les publications ET la pagination keyset', async () => {
    const { transport } = recordingTransport(OK);
    const result = await loadBookmarkedPostsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.posts.map((p) => p.id)).toEqual(['p1']);
    expect(result.data.pagination).toEqual({ limit: 20, hasMore: true, nextCursor: 'k2' });
  });

  test('un refus de transport est PROPAGÉ, jamais transformé en page vide', async () => {
    const { transport } = recordingTransport({ ok: false, status: 401, error: 'Unauthorized' });
    const result = await loadBookmarkedPostsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
  });

  /**
   * `getBookmarks` sert `isBookmarkedByMe: true` SANS CONDITION — la liste EST
   * construite depuis la table des favoris du lecteur. Le port ne le refait
   * pas : il transmet ce que la passerelle dit. Ce témoin garde l'absence de
   * réécriture autant que la présence du champ.
   */
  test('le port ne RÉÉCRIT pas le signet — il sert la forme de la passerelle', async () => {
    const { transport } = recordingTransport({ ...OK, data: [{ ...post('p1'), isBookmarkedByMe: true, bookmarkCount: 3 }] });
    const result = await loadBookmarkedPostsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.posts[0]?.isBookmarkedByMe).toBe(true);
    expect(result.data.posts[0]?.bookmarkCount).toBe(3);
  });
});

describe('bookmarkedPostsInfiniteOptions', () => {
  test('la clé est CELLE que le geste bascule — une seconde clé ferait deux corpus', () => {
    expect(bookmarkedPostsInfiniteOptions({ source: 'gateway', transport: {} as HttpTransport }).queryKey).toBe(
      BOOKMARKS_QUERY_KEY,
    );
  });

  test('la première page part SANS curseur, et la suivante prend celui que la page a rendu', () => {
    const options = bookmarkedPostsInfiniteOptions({ source: 'gateway', transport: {} as HttpTransport });
    expect(options.initialPageParam).toBeUndefined();
    const premiere = { posts: [post('p1')], pagination: { limit: 20, hasMore: true, nextCursor: 'k2' } };
    expect(options.getNextPageParam(premiere, [premiere], undefined)).toBe('k2');
  });

  test('une page qui n’annonce PAS de suite arrête la pagination', () => {
    const options = bookmarkedPostsInfiniteOptions({ source: 'gateway', transport: {} as HttpTransport });
    const derniere = { posts: [post('p1')], pagination: { limit: 20, hasMore: false, nextCursor: null } };
    expect(options.getNextPageParam(derniere, [derniere], undefined)).toBeUndefined();
  });
});
