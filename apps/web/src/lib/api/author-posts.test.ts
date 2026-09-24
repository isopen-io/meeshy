import { describe, expect, test } from 'bun:test';

import {
  authorPostsInfiniteOptions,
  authorPostsQueryKey,
  AUTHOR_POSTS_PAGE_SIZE,
  loadAuthorPosts,
} from './author-posts';
import type { FeedPage, FeedPost } from './feed-pages';
import type { HttpTransport } from './http';

/**
 * LE PORT DES PUBLICATIONS D'UN AUTEUR (#7083) — deux affirmations, et la
 * seconde est celle qui casse en silence : le curseur est OPAQUE (keyset
 * `createdAt + id`, `PostFeedService.ts:916-918`), PAS le décalage entier du
 * hashtag. Le lire comme un nombre rendrait `cursor=NaN` et une seconde page
 * identique à la première.
 */

const post = (id: string): FeedPost => ({ id, type: 'POST', createdAt: '2026-09-01T10:00:00.000Z' });

const page = (posts: readonly FeedPost[], pagination: Partial<FeedPage['pagination']>): FeedPage => ({
  posts,
  pagination: { limit: AUTHOR_POSTS_PAGE_SIZE, hasMore: false, nextCursor: null, ...pagination },
});

type Call = { readonly path: string; readonly headers?: Readonly<Record<string, string>> };

const recordingTransport = (
  reply: { readonly ok: true; readonly status: number; readonly data: unknown; readonly pagination?: unknown } | { readonly ok: false; readonly status: number; readonly error: string },
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

const OK = { ok: true as const, status: 200, data: [post('p1')], pagination: { limit: 20, hasMore: true, nextCursor: 'k2' } };

describe('loadAuthorPosts', () => {
  test('la requête porte `scope=author`, l’auteur, la limite et `X-Canvas-Caps: 3`', async () => {
    const { transport, calls } = recordingTransport(OK);
    await loadAuthorPosts({ source: 'gateway', transport, authorId: 'u-rich-kwame' });
    expect(calls[0]?.path).toBe(`/api/v1/social/posts?scope=author&authorId=u-rich-kwame&limit=${AUTHOR_POSTS_PAGE_SIZE}`);
    expect(calls[0]?.headers).toEqual({ 'X-Canvas-Caps': '3' });
  });

  test('le curseur est transmis TEL QUEL — une chaîne opaque, jamais un nombre', async () => {
    const { transport, calls } = recordingTransport(OK);
    await loadAuthorPosts({ source: 'gateway', transport, authorId: 'u-1', cursor: 'MjAyNi0wOS0wMXxwMQ==' });
    expect(calls[0]?.path).toContain('cursor=MjAyNi0wOS0wMXxwMQ%3D%3D');
    expect(calls[0]?.path).not.toContain('NaN');
  });

  test('la page servie porte les publications ET la pagination keyset', async () => {
    const { transport } = recordingTransport(OK);
    const result = await loadAuthorPosts({ source: 'gateway', transport, authorId: 'u-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.posts.map((p) => p.id)).toEqual(['p1']);
    expect(result.data.pagination).toEqual({ limit: 20, hasMore: true, nextCursor: 'k2' });
  });

  test('un refus de transport est PROPAGÉ, jamais transformé en page vide', async () => {
    const { transport } = recordingTransport({ ok: false, status: 429, error: 'Too many requests' });
    const result = await loadAuthorPosts({ source: 'gateway', transport, authorId: 'u-1' });
    expect(result).toEqual({ ok: false, status: 429, error: 'Too many requests' });
  });
});

describe('authorPostsInfiniteOptions — la pagination', () => {
  const next = (lastPage: FeedPage, allPages: readonly FeedPage[], lastParam: string | undefined) =>
    authorPostsInfiniteOptions({ source: 'fixtures', transport: {} as HttpTransport, authorId: 'u-1' }).getNextPageParam(
      lastPage,
      allPages,
      lastParam,
    );

  test('une page qui annonce une suite ET apporte une ligne neuve rend son curseur', () => {
    const first = page([post('p1')], { hasMore: true, nextCursor: 'c2' });
    expect(next(first, [first], undefined)).toBe('c2');
  });

  test('`hasMore: false` arrête', () => {
    const second = page([post('p2')], { hasMore: false, nextCursor: 'c3' });
    expect(next(second, [second], 'c2')).toBeUndefined();
  });

  test('un curseur STAGNANT arrête — jamais une boucle sans fin', () => {
    const second = page([post('p2')], { hasMore: true, nextCursor: 'c2' });
    expect(next(second, [second], 'c2')).toBeUndefined();
  });

  test('une page dont AUCUNE ligne n’est neuve arrête', () => {
    const first = page([post('p1')], { hasMore: true, nextCursor: 'c2' });
    const second = page([post('p1')], { hasMore: true, nextCursor: 'c3' });
    expect(next(second, [first, second], 'c2')).toBeUndefined();
  });

  test('une page VIDE qui annonce une suite arrête', () => {
    const empty = page([], { hasMore: true, nextCursor: 'c3' });
    expect(next(empty, [empty], 'c2')).toBeUndefined();
  });
});

describe('authorPostsQueryKey', () => {
  test('deux auteurs ne partagent jamais une page', () => {
    expect(authorPostsQueryKey('u-a')).toEqual(['author-posts', 'u-a']);
    expect(authorPostsQueryKey('u-a')).not.toEqual(authorPostsQueryKey('u-b'));
  });
});
