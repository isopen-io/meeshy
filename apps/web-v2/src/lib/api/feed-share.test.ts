import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { recordPostShare } from './feed-share';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

const seeded = (post: Partial<FeedPost>): QueryClient => {
  const queryClient = new QueryClient();
  const data: FeedInfiniteData = {
    pages: [
      {
        posts: [{ id: 'p1', type: 'POST', createdAt: '2026-09-13T11:55:00.000Z', ...post }],
        pagination: { limit: 20, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  };
  queryClient.setQueryData(FEED_QUERY_KEY, data);
  return queryClient;
};

const shareCountOf = (queryClient: QueryClient) =>
  queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0]?.shareCount;

const answering = (respond: () => Promise<ApiResult<unknown>>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return respond();
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

describe('recordPostShare — le partage COMPTÉ, une fois le lien parti (#6278)', () => {
  test('`POST /api/v1/posts/:id/share` avec `platform: "web"`, et le compte ABSOLU servi entre au fil', async () => {
    const queryClient = seeded({ shareCount: 2 });
    const { requests, transport } = answering(async () => ({ ok: true, data: { shared: true, shareCount: 9 } }));

    expect(await recordPostShare({ postId: 'p1', deps: { source: 'gateway', transport, queryClient } })).toBe(true);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/share');
    expect(requests[0]?.body).toEqual({ platform: 'web' });
    expect(shareCountOf(queryClient)).toBe(9);
  });

  /** Rien n'a été écrit d'avance : un compte perdu ne mérite ni rollback ni
   * annonce — le lien, lui, est déjà parti chez le destinataire. */
  test('un refus ou une panne ne touche pas au compte et rend `false`, sans lever', async () => {
    const refused = seeded({ shareCount: 2 });
    const r1 = answering(async () => ({ ok: false, status: 404, error: 'Post not found' }));
    expect(await recordPostShare({ postId: 'p1', deps: { source: 'gateway', transport: r1.transport, queryClient: refused } })).toBe(false);
    expect(shareCountOf(refused)).toBe(2);

    const offline = seeded({ shareCount: 2 });
    const r2 = answering(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await recordPostShare({ postId: 'p1', deps: { source: 'gateway', transport: r2.transport, queryClient: offline } })).toBe(false);
    expect(shareCountOf(offline)).toBe(2);
  });

  test('fixtures : compté sans toucher au transport', async () => {
    const queryClient = seeded({ shareCount: 2 });
    expect(await recordPostShare({ postId: 'p1', deps: { source: 'fixtures', transport: {} as HttpTransport, queryClient } })).toBe(true);
  });
});
