import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { findCardPost, updateCardPost } from './card-caches';
import {
  communityPostsInfiniteOptions,
  communityPostsQueryKey,
  COMMUNITY_POSTS_PAGE_SIZE,
  loadCommunityPosts,
} from './community-posts';
import type { FeedPage, FeedPost } from './feed-pages';
import type { HttpTransport } from './http';

/**
 * LE PORT DES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) —
 * `GET social.posts?scope=community&communityId=<id>`, curseur OPAQUE (keyset),
 * et sa caisse est au registre des cartes : un cœur posé sur une carte du
 * détail d'une communauté y change la carte, comme partout ailleurs.
 */

const post = (id: string): FeedPost => ({ id, type: 'POST', createdAt: '2026-11-01T10:00:00.000Z' });

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

describe('loadCommunityPosts', () => {
  test('la requête porte `scope=community`, la communauté, la limite et `X-Canvas-Caps`', async () => {
    const { transport, calls } = recordingTransport(OK);
    await loadCommunityPosts({ source: 'gateway', transport, communityId: '6740c0ffee0000000000abcd' });
    expect(calls[0]?.path).toBe(`/api/v1/social/posts?scope=community&communityId=6740c0ffee0000000000abcd&limit=${COMMUNITY_POSTS_PAGE_SIZE}`);
    expect(calls[0]?.headers).toEqual({ 'X-Canvas-Caps': '3' });
  });

  test('le curseur est transmis TEL QUEL', async () => {
    const { transport, calls } = recordingTransport(OK);
    await loadCommunityPosts({ source: 'gateway', transport, communityId: 'c1', cursor: 'MjAyNnxwMQ==' });
    expect(calls[0]?.path).toContain('cursor=MjAyNnxwMQ%3D%3D');
  });

  test('la page servie porte les publications et la pagination keyset', async () => {
    const { transport } = recordingTransport(OK);
    const result = await loadCommunityPosts({ source: 'gateway', transport, communityId: 'c1' });
    expect(result.ok && result.data).toEqual({ posts: [post('p1')], pagination: { limit: 20, hasMore: true, nextCursor: 'k2' } });
  });

  test('un refus est PROPAGÉ, jamais transformé en page vide', async () => {
    const { transport } = recordingTransport({ ok: false, status: 503, error: 'Service unavailable' });
    expect(await loadCommunityPosts({ source: 'gateway', transport, communityId: 'c1' })).toEqual({ ok: false, status: 503, error: 'Service unavailable' });
  });

  test('les données de démonstration servent « Équipe déploiement », et rien pour une autre', async () => {
    const transport = {} as HttpTransport;
    const served = await loadCommunityPosts({ source: 'fixtures', transport, communityId: 'm-deploiement' });
    const other = await loadCommunityPosts({ source: 'fixtures', transport, communityId: 'm-lecture' });
    expect(served.ok && served.data.posts.length > 0).toBe(true);
    expect(other.ok && other.data.posts).toEqual([]);
  });
});

describe('communityPostsInfiniteOptions', () => {
  test('la clé est celle de la communauté, et une page sans suite s’arrête', () => {
    const options = communityPostsInfiniteOptions({ source: 'fixtures', transport: {} as HttpTransport, communityId: 'c1' });
    expect(options.queryKey).toEqual(communityPostsQueryKey('c1'));
    const last: FeedPage = { posts: [post('p1')], pagination: { limit: 20, hasMore: false, nextCursor: null } };
    expect(options.getNextPageParam(last, [last], undefined)).toBeUndefined();
  });
});

describe('la caisse d’une communauté est au registre des cartes', () => {
  test('une carte modifiée ailleurs change aussi dans le détail de la communauté', () => {
    const queryClient = new QueryClient();
    const page: FeedPage = { posts: [{ ...post('p1'), likeCount: 1 }], pagination: { limit: 20, hasMore: false, nextCursor: null } };
    queryClient.setQueryData(communityPostsQueryKey('c1'), { pages: [page], pageParams: [undefined] });
    updateCardPost(queryClient, 'p1', (card) => ({ ...card, likeCount: 2 }));
    expect(findCardPost(queryClient, 'p1')?.likeCount).toBe(2);
  });
});
