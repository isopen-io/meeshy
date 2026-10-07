import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import { cachedOn, pageOf, scripted } from '@/test-support/feed-cache-kit';
import { holdViewerPoints, withKeptViewerPoints } from '@/lib/feed/viewer-points';

import { mergeServedPost } from './card-caches';
import { FEED_QUERY_KEY, feedInfiniteOptions } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { applyPostEngagement, bindPostEngagement } from './publication-engagement';
import { postQueryKey, postQueryOptions } from './publication-detail';

/**
 * #9570 — UN POST DIT CE QU'IL A RAPPORTÉ AU LECTEUR (`viewerPoints`, contrat
 * passerelle #9569). La valeur est ABSOLUE et MONOTONE : entre ce que le
 * client sait et ce qu'il reçoit — par une lecture OU par
 * `engagement:post-updated` — il garde la plus grande (`keptViewerPoints`,
 * `@meeshy/shared/types/engagement-scale`). Absent veut dire « garde ce que tu
 * sais », jamais zéro.
 */

const post = (id: string, overrides: Partial<FeedPost> = {}): FeedPost => ({
  id,
  type: 'POST',
  createdAt: '2026-10-07T10:00:00.000Z',
  content: `texte ${id}`,
  ...overrides,
});

const pointsOf = (queryClient: QueryClient, id: string): number | null | undefined => cachedOn(queryClient, FEED_QUERY_KEY, id)?.viewerPoints;

const seeded = (posts: readonly FeedPost[]): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(FEED_QUERY_KEY, pageOf(posts));
  return queryClient;
};

function fakeSocket() {
  const handlers = new Map<string, Set<SocketHandler>>();
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set<SocketHandler>();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
  };
  const fire = (event: string, payload: unknown) => handlers.get(event)?.forEach((handler) => handler(payload));
  const listeners = () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0);
  return { socket, fire, listeners };
}

describe('la loi — garder la plus grande, absent ⇒ ce qu’on sait', () => {
  test('une valeur reçue se pose sur un post qui n’en savait rien, zéro compris', () => {
    expect(withKeptViewerPoints(post('p1'), 0).viewerPoints).toBe(0);
    expect(withKeptViewerPoints(post('p1'), 42).viewerPoints).toBe(42);
  });

  test('une valeur plus grande gagne ; une plus petite est une valeur ANCIENNE arrivée en retard', () => {
    const held = post('p1', { viewerPoints: 50 });
    expect(withKeptViewerPoints(held, 60).viewerPoints).toBe(60);
    expect(withKeptViewerPoints(held, 40)).toBe(held);
    expect(withKeptViewerPoints(held, 50)).toBe(held);
  });

  test('rien de reçu ⇒ le post est rendu tel quel', () => {
    const held = post('p1', { viewerPoints: 50 });
    expect(withKeptViewerPoints(held, undefined)).toBe(held);
  });
});

describe('l’événement engagement:post-updated', () => {
  test('met à jour la carte de CE post, dans le fil et sur la fiche, et seulement elle', () => {
    const queryClient = seeded([post('p1', { viewerPoints: 10 }), post('p2', { viewerPoints: 3 })]);
    queryClient.setQueryData(postQueryKey('p1'), post('p1', { viewerPoints: 10 }));

    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 12 });

    expect(pointsOf(queryClient, 'p1')).toBe(12);
    expect(pointsOf(queryClient, 'p2')).toBe(3);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.viewerPoints).toBe(12);
  });

  test('ne fait JAMAIS descendre la valeur', () => {
    const queryClient = seeded([post('p1', { viewerPoints: 30 })]);
    const before = queryClient.getQueryData(FEED_QUERY_KEY);
    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 20 });
    expect(pointsOf(queryClient, 'p1')).toBe(30);
    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBe(before);
  });

  test('un post inconnu (création pas encore servie) : rien ne bouge', () => {
    const queryClient = seeded([post('p1', { viewerPoints: 5 })]);
    const before = queryClient.getQueryData(FEED_QUERY_KEY);
    applyPostEngagement(queryClient, { postId: 'p-neuf', viewerPoints: 9 });
    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBe(before);
  });

  test('une charge malformée est ignorée entière', () => {
    const queryClient = seeded([post('p1', { viewerPoints: 5 })]);
    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: -1 });
    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 7.5 });
    applyPostEngagement(queryClient, { postId: '', viewerPoints: 7 });
    applyPostEngagement(queryClient, null);
    expect(pointsOf(queryClient, 'p1')).toBe(5);
  });

  test('republication simple : l’événement qui nomme l’ORIGINAL ne touche pas la carte de la republication, qui garde SA valeur', () => {
    const original = post('orig', { viewerPoints: 4 });
    const repost = post('rp', { viewerPoints: 2, repostOfId: 'orig', repostOf: { id: 'orig', content: 'texte orig' } });
    const queryClient = seeded([repost, original]);

    applyPostEngagement(queryClient, { postId: 'orig', viewerPoints: 9 });

    expect(pointsOf(queryClient, 'orig')).toBe(9);
    expect(pointsOf(queryClient, 'rp')).toBe(2);
    expect(cachedOn(queryClient, FEED_QUERY_KEY, 'rp')?.repostOf).toEqual({ id: 'orig', content: 'texte orig' });
  });

  test('branché sur le socket, débranché proprement', () => {
    const { socket, fire, listeners } = fakeSocket();
    const queryClient = seeded([post('p1', { viewerPoints: 1 })]);
    const unbind = bindPostEngagement({ socket, queryClient });
    expect(listeners()).toBe(1);

    fire(SERVER_EVENTS.ENGAGEMENT_POST_UPDATED, { postId: 'p1', viewerPoints: 8 });
    expect(pointsOf(queryClient, 'p1')).toBe(8);

    unbind();
    expect(listeners()).toBe(0);
    fire(SERVER_EVENTS.ENGAGEMENT_POST_UPDATED, { postId: 'p1', viewerPoints: 99 });
    expect(pointsOf(queryClient, 'p1')).toBe(8);
  });
});

describe('une réponse d’écriture ou une diffusion ne porte pas le champ : la carte garde ce qu’elle sait', () => {
  test('mergeServedPost garde viewerPoints quand le post servi ne le porte pas', () => {
    const held = post('p1', { viewerPoints: 15 });
    expect(mergeServedPost(post('p1', { content: 'corrigé' }), held).viewerPoints).toBe(15);
  });

  test('…et garde la plus grande quand il le porte', () => {
    const held = post('p1', { viewerPoints: 15 });
    expect(mergeServedPost(post('p1', { viewerPoints: 9 }), held).viewerPoints).toBe(15);
    expect(mergeServedPost(post('p1', { viewerPoints: 21 }), held).viewerPoints).toBe(21);
  });
});

describe('une LECTURE garde aussi la plus grande (structuralSharing des caisses de cartes)', () => {
  const served = (posts: readonly FeedPost[]) => ({ ok: true as const, data: posts });

  test('le fil relu : une valeur plus petite ou absente ne fait pas reculer la carte', async () => {
    const responses = [
      served([post('p1', { viewerPoints: 30 }), post('p2', { viewerPoints: 0 })]),
      served([post('p1', { viewerPoints: 25 }), post('p2', { viewerPoints: 0 })]),
      served([post('p1'), post('p2', { viewerPoints: 6 })]),
      served([post('p1', { viewerPoints: 70 }), post('p2', { viewerPoints: 6 })]),
    ];
    const { transport } = scripted(async () => responses.shift() ?? served([]));
    const queryClient = new QueryClient();
    const options = feedInfiniteOptions({ source: 'gateway', transport });

    await queryClient.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(pointsOf(queryClient, 'p1')).toBe(30);

    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 50 });
    await queryClient.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(pointsOf(queryClient, 'p1')).toBe(50);

    await queryClient.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(pointsOf(queryClient, 'p1')).toBe(50);
    expect(pointsOf(queryClient, 'p2')).toBe(6);

    await queryClient.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(pointsOf(queryClient, 'p1')).toBe(70);
  });

  test('la fiche relue : même loi', async () => {
    const responses = [{ ok: true as const, data: post('p1', { viewerPoints: 12 }) }, { ok: true as const, data: post('p1') }];
    const { transport } = scripted(async () => responses.shift() ?? { ok: true as const, data: post('p1', { viewerPoints: 1 }) });
    const queryClient = new QueryClient();
    const options = postQueryOptions({ source: 'gateway', transport, postId: 'p1' });

    await queryClient.fetchQuery({ ...options, staleTime: 0 });
    await queryClient.fetchQuery({ ...options, staleTime: 0 });
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.viewerPoints).toBe(12);

    await queryClient.fetchQuery({ ...options, staleTime: 0 });
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.viewerPoints).toBe(12);
  });

  test('holdViewerPoints laisse intacte une donnée qui n’est pas une caisse de cartes', () => {
    expect(holdViewerPoints(3, 5)).toBe(5);
    const same = { a: 1 };
    expect(holdViewerPoints({ a: 1 }, same)).toEqual({ a: 1 });
  });

  test('holdViewerPoints rend la donnée PRÉCÉDENTE quand rien n’a changé — le partage structurel tient', () => {
    const previous: FeedInfiniteData = pageOf([post('p1', { viewerPoints: 4 })]);
    const next: FeedInfiniteData = pageOf([post('p1', { viewerPoints: 4 })]);
    expect(holdViewerPoints(previous, next)).toBe(previous);
  });
});
