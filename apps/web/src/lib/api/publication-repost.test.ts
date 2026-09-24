import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { reelsQueryKey } from './reels';
import { performRepost, type RepostDeps } from './publication-repost';

/**
 * `performRepost` (#6484) — MÊME forme que `feed-gestures.test.ts` :
 * plan → optimiste → appel → issue.
 */
const post = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'REEL',
  createdAt: '2026-09-24T11:55:00.000Z',
  ...partial,
});

const pageOf = (posts: readonly FeedPost[]): FeedInfiniteData => ({
  pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

const seededOn = (queryKey: readonly string[], posts: readonly FeedPost[]): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKey as unknown as readonly unknown[], pageOf(posts));
  return queryClient;
};

const cachedOn = (queryClient: QueryClient, queryKey: readonly string[], id = 'p1'): FeedPost | undefined =>
  queryClient
    .getQueryData<FeedInfiniteData>(queryKey as unknown as readonly unknown[])
    ?.pages[0]?.posts.find((p) => p.id === id);

const scripted = (respond: (req: HttpRequest) => Promise<ApiResult<unknown>>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return respond(req);
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

const gatewayDeps = (queryClient: QueryClient, transport: HttpTransport): RepostDeps => ({
  source: 'gateway',
  transport,
  queryClient,
});

let restoreOnline: (() => void) | null = null;
const setOnline = (value: boolean) => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  restoreOnline = () => {
    if (descriptor === undefined) delete (navigator as { onLine?: boolean }).onLine;
    else Object.defineProperty(navigator, 'onLine', descriptor);
  };
};

afterEach(() => {
  restoreOnline?.();
  restoreOnline = null;
});

describe('performRepost — optimiste, puis la passerelle', () => {
  test('optimiste AVANT réponse — sur les DEUX caisses (Flux et Réels)', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(FEED_QUERY_KEY as unknown as readonly unknown[], pageOf([post({ isRepostedByMe: false, repostCount: 2 })]));
    queryClient.setQueryData(reelsQueryKey('seed') as unknown as readonly unknown[], pageOf([post({ isRepostedByMe: false, repostCount: 2 })]));
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const pending = performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });
    const onFeed = cachedOn(queryClient, FEED_QUERY_KEY as unknown as string[]);
    expect(onFeed?.isRepostedByMe).toBe(true);
    expect(onFeed?.repostCount).toBe(3);
    const onReels = cachedOn(queryClient, reelsQueryKey('seed') as unknown as string[]);
    expect(onReels?.isRepostedByMe).toBe(true);
    expect(onReels?.repostCount).toBe(3);

    release({ ok: true, status: 201, data: { id: 'repost-1', repostOfId: 'p1' } });
    await pending;
  });

  test('la requête : POST sur la cible, corps minimal, en-tête cmid', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ isRepostedByMe: false, repostCount: 0, type: 'REEL' })]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    await performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/repost');
    expect(requests[0]?.body).toEqual({ targetType: 'REEL', isQuote: false });
    expect(requests[0]?.headers?.['X-Client-Mutation-Id']).toMatch(/^cmid_/);
  });

  test('un format que `RepostSchema` n’accepte pas n’est PAS envoyé — la passerelle refuserait le geste entier (400)', async () => {
    /* `MOOD` est une valeur réelle de `Post.type` que `RepostSchema.targetType`
       (`services/gateway/src/routes/posts/types.ts:491-499`) n'énumère pas :
       l'envoyer rend 400 VALIDATION_ERROR, et le repost légitime échoue.
       Omis, la passerelle applique son défaut. Même sort pour une carte
       qu'aucune caisse ne porte : rien n'est inventé. */
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ id: 'm1', type: 'MOOD', isRepostedByMe: false })]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    await performRepost({ postId: 'm1', deps: gatewayDeps(queryClient, transport) });
    await performRepost({ postId: 'inconnue', deps: gatewayDeps(queryClient, transport) });

    expect(requests.map((r) => r.body)).toEqual([{ isQuote: false }, { isQuote: false }]);
  });

  test('la cible GRIMPE à la racine — carte encastrée', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [
      post({ id: 'r1', type: 'REEL', repostOfId: 'r0', originalRepostOfId: 'root', isRepostedByMe: false }),
    ]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    await performRepost({ postId: 'r1', deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.path).toBe('/api/v1/posts/root/repost');
    expect((requests[0]?.body as { readonly targetType: string }).targetType).toBe('REEL');
  });

  test('la cible SANS chaîne vise la carte elle-même', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ id: 'r1', type: 'REEL', isRepostedByMe: false })]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    await performRepost({ postId: 'r1', deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.path).toBe('/api/v1/posts/r1/repost');
  });

  test('succès 201 ⇒ notice, le +1 reste (aucun compte absolu servi)', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ isRepostedByMe: false, repostCount: 0 })]);
    const { transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    const result = await performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: true, notice: 'feed.post.repost.success' });
    expect(cachedOn(queryClient, FEED_QUERY_KEY as unknown as string[])?.repostCount).toBe(1);
  });

  test('refus PERMANENT (403 puis 404) ⇒ rollback + issue "error"/"refused"', async () => {
    for (const status of [403, 404]) {
      const queryClient = seededOn(FEED_QUERY_KEY, [post({ isRepostedByMe: false, repostCount: 0 })]);
      const { transport } = scripted(async () => ({ ok: false, status, error: 'nope' }));

      const result = await performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });

      expect(result).toEqual({ ok: false, message: 'feed.post.repost.error', issue: 'refused' });
      const rolledBack = cachedOn(queryClient, FEED_QUERY_KEY as unknown as string[]);
      expect(rolledBack?.isRepostedByMe).toBe(false);
      expect(rolledBack?.repostCount).toBe(0);
    }
  });

  test('issue PASSAGÈRE (réponse null, 429, 503) ⇒ rollback + "unconfirmed" — le repost ne se laisse pas affirmer sans confirmation', async () => {
    const cases: readonly (() => Promise<ApiResult<unknown>>)[] = [
      () => Promise.reject(new Error('réseau')),
      async () => ({ ok: false, status: 429, error: 'trop de requêtes' }),
      async () => ({ ok: false, status: 503, error: 'indisponible' }),
    ];
    for (const respond of cases) {
      const queryClient = seededOn(FEED_QUERY_KEY, [post({ isRepostedByMe: false, repostCount: 0 })]);
      const { transport } = scripted(respond);

      const result = await performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });

      expect(result).toEqual({ ok: false, message: 'feed.post.repost.unconfirmed', issue: 'unconfirmed' });
      const rolledBack = cachedOn(queryClient, FEED_QUERY_KEY as unknown as string[]);
      expect(rolledBack?.isRepostedByMe).toBe(false);
      expect(rolledBack?.repostCount).toBe(0);
    }
  });

  test('409 MUTATION_IN_FLIGHT et 410 MUTATION_RESULT_GONE ⇒ ok, SANS rollback', async () => {
    for (const status of [409, 410]) {
      const queryClient = seededOn(FEED_QUERY_KEY, [post({ isRepostedByMe: false, repostCount: 0 })]);
      const { transport } = scripted(async () => ({ ok: false, status, error: 'déjà' }));

      const result = await performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });

      expect(result).toEqual({ ok: true });
      const kept = cachedOn(queryClient, FEED_QUERY_KEY as unknown as string[]);
      expect(kept?.isRepostedByMe).toBe(true);
      expect(kept?.repostCount).toBe(1);
    }
  });

  test('un geste à la fois — deux appels concurrents ⇒ UNE requête', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ isRepostedByMe: false, repostCount: 0 })]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { requests, transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const first = performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });
    const second = performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });
    release({ ok: true, status: 201, data: {} });
    await Promise.all([first, second]);

    expect(requests).toHaveLength(1);
  });

  test('déjà repartagé (cache) ⇒ AUCUNE requête, notice "already"', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ isRepostedByMe: true, repostCount: 4 })]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    const result = await performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: true, notice: 'feed.post.repost.already' });
    expect(requests).toHaveLength(0);
  });

  test('fixtures ⇒ aucune requête au transport, succès, cache basculé', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ isRepostedByMe: false, repostCount: 0 })]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    const result = await performRepost({ postId: 'p1', deps: { source: 'fixtures', transport, queryClient } });

    expect(result).toEqual({ ok: true, notice: 'feed.post.repost.success' });
    expect(requests).toHaveLength(0);
    expect(cachedOn(queryClient, FEED_QUERY_KEY as unknown as string[])?.isRepostedByMe).toBe(true);
  });
});

describe('performRepost — hors ligne et audience', () => {
  test('hors ligne ⇒ AUCUN optimiste, AUCUNE requête, refus sur place', async () => {
    setOnline(false);
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ isRepostedByMe: false, repostCount: 0 })]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    const result = await performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: 'feed.post.repost.offline', issue: 'refused' });
    expect(requests).toHaveLength(0);
    const untouched = cachedOn(queryClient, FEED_QUERY_KEY as unknown as string[]);
    expect(untouched?.isRepostedByMe).toBe(false);
    expect(untouched?.repostCount).toBe(0);
  });

  test('la loi d’audience partagée — élargir est refusé LOCALEMENT, sans requête', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ visibility: 'FRIENDS', isRepostedByMe: false })]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    const result = await performRepost({
      postId: 'p1',
      deps: gatewayDeps(queryClient, transport),
      intent: { visibility: 'PUBLIC' },
    });

    expect(result).toEqual({ ok: false, message: 'feed.post.repost.audience', issue: 'refused' });
    expect(requests).toHaveLength(0);
  });

  test('la loi d’audience partagée — rétrécir part avec la visibilité demandée', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ visibility: 'FRIENDS', isRepostedByMe: false })]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    await performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport), intent: { visibility: 'PRIVATE' } });

    expect((requests[0]?.body as { readonly visibility?: string }).visibility).toBe('PRIVATE');
  });

  test('sans intention de visibilité — hérite, jamais posée sur la requête', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY, [post({ visibility: 'FRIENDS', isRepostedByMe: false })]);
    const { requests, transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    await performRepost({ postId: 'p1', deps: gatewayDeps(queryClient, transport) });

    expect('visibility' in (requests[0]?.body as Record<string, unknown>)).toBe(false);
  });
});
