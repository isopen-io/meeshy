import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import { cachedOn, pageOf, scripted } from '@/test-support/feed-cache-kit';
import { holdViewerPoints, withAnnouncedViewerPoints } from '@/lib/feed/viewer-points';

import { mergeServedPost } from './card-caches';
import { FEED_QUERY_KEY, feedInfiniteOptions } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { applyPostEngagement, bindPostEngagement } from './publication-engagement';
import { postQueryKey, postQueryOptions } from './publication-detail';

/**
 * #9570 — UN POST DIT CE QU'IL A RAPPORTÉ AU LECTEUR (`viewerPoints`, contrat
 * passerelle #9569, règle des reprises #9584). La valeur est ABSOLUE et peut
 * BAISSER (retirer une réaction reprend ses points). Ce que le client garde
 * est la loi partagée `keptViewerPoints` : une ANNONCE (`engagement:post-updated`,
 * porte `at`) s'applique si elle est plus récente que la dernière appliquée,
 * qu'elle monte ou qu'elle baisse ; une LECTURE (fil, fiche) s'applique telle
 * quelle et garde l'instant de la dernière annonce ; un champ absent (réponse
 * d'écriture, ancien serveur) ne change rien, jamais zéro.
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

describe('la loi — l’annonce la plus récente gagne, une lecture s’applique, absent ⇒ ce qu’on sait', () => {
  test('une annonce se pose sur un post qui n’en savait rien, zéro compris, avec son instant', () => {
    expect(withAnnouncedViewerPoints(post('p1'), { viewerPoints: 0, at: 10 })).toMatchObject({ viewerPoints: 0, viewerPointsAt: 10 });
    expect(withAnnouncedViewerPoints(post('p1'), { viewerPoints: 42, at: 10 })).toMatchObject({ viewerPoints: 42, viewerPointsAt: 10 });
  });

  test('une annonce plus récente gagne, qu’elle monte ou qu’elle baisse — une reprise baisse', () => {
    const held = post('p1', { viewerPoints: 50, viewerPointsAt: 20 });
    expect(withAnnouncedViewerPoints(held, { viewerPoints: 60, at: 30 })).toMatchObject({ viewerPoints: 60, viewerPointsAt: 30 });
    expect(withAnnouncedViewerPoints(held, { viewerPoints: 40, at: 30 })).toMatchObject({ viewerPoints: 40, viewerPointsAt: 30 });
  });

  test('une annonce plus ancienne arrivée en retard ne change rien — même référence', () => {
    const held = post('p1', { viewerPoints: 50, viewerPointsAt: 20 });
    expect(withAnnouncedViewerPoints(held, { viewerPoints: 90, at: 10 })).toBe(held);
  });

  test('une valeur LUE (sans instant) puis une annonce : l’annonce s’applique', () => {
    const read = post('p1', { viewerPoints: 5 });
    expect(withAnnouncedViewerPoints(read, { viewerPoints: 3, at: 1 })).toMatchObject({ viewerPoints: 3, viewerPointsAt: 1 });
  });
});

describe('l’événement engagement:post-updated', () => {
  test('met à jour la carte de CE post, dans le fil et sur la fiche, et seulement elle', () => {
    const queryClient = seeded([post('p1', { viewerPoints: 10 }), post('p2', { viewerPoints: 3 })]);
    queryClient.setQueryData(postQueryKey('p1'), post('p1', { viewerPoints: 10 }));

    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 12, at: 100 });

    expect(pointsOf(queryClient, 'p1')).toBe(12);
    expect(pointsOf(queryClient, 'p2')).toBe(3);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.viewerPoints).toBe(12);
  });

  test('une reprise fait BAISSER la carte ; une annonce plus ancienne arrivée ensuite ne la défait pas', () => {
    const queryClient = seeded([post('p1', { viewerPoints: 30 })]);
    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 22, at: 200 });
    expect(pointsOf(queryClient, 'p1')).toBe(22);

    const before = queryClient.getQueryData(FEED_QUERY_KEY);
    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 30, at: 150 });
    expect(pointsOf(queryClient, 'p1')).toBe(22);
    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBe(before);
  });

  test('un post inconnu (création pas encore servie) : rien ne bouge', () => {
    const queryClient = seeded([post('p1', { viewerPoints: 5 })]);
    const before = queryClient.getQueryData(FEED_QUERY_KEY);
    applyPostEngagement(queryClient, { postId: 'p-neuf', viewerPoints: 9, at: 1 });
    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBe(before);
  });

  test('une charge malformée est ignorée entière — un instant manquant compris', () => {
    const queryClient = seeded([post('p1', { viewerPoints: 5 })]);
    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: -1, at: 1 });
    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 7.5, at: 1 });
    applyPostEngagement(queryClient, { postId: '', viewerPoints: 7, at: 1 });
    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 7 });
    applyPostEngagement(queryClient, null);
    expect(pointsOf(queryClient, 'p1')).toBe(5);
  });

  test('republication simple : l’annonce qui nomme l’ORIGINAL ne touche pas la carte de la republication, qui garde SA valeur', () => {
    const original = post('orig', { viewerPoints: 4 });
    const repost = post('rp', { viewerPoints: 2, repostOfId: 'orig', repostOf: { id: 'orig', content: 'texte orig' } });
    const queryClient = seeded([repost, original]);

    applyPostEngagement(queryClient, { postId: 'orig', viewerPoints: 9, at: 1 });

    expect(pointsOf(queryClient, 'orig')).toBe(9);
    expect(pointsOf(queryClient, 'rp')).toBe(2);
    expect(cachedOn(queryClient, FEED_QUERY_KEY, 'rp')?.repostOf).toEqual({ id: 'orig', content: 'texte orig' });
  });

  test('branché sur le socket, débranché proprement', () => {
    const { socket, fire, listeners } = fakeSocket();
    const queryClient = seeded([post('p1', { viewerPoints: 1 })]);
    const unbind = bindPostEngagement({ socket, queryClient });
    expect(listeners()).toBe(1);

    fire(SERVER_EVENTS.ENGAGEMENT_POST_UPDATED, { postId: 'p1', viewerPoints: 8, at: 1 });
    expect(pointsOf(queryClient, 'p1')).toBe(8);

    unbind();
    expect(listeners()).toBe(0);
    fire(SERVER_EVENTS.ENGAGEMENT_POST_UPDATED, { postId: 'p1', viewerPoints: 99, at: 2 });
    expect(pointsOf(queryClient, 'p1')).toBe(8);
  });
});

describe('une réponse d’écriture ou une diffusion ne porte pas le champ : la carte garde ce qu’elle sait', () => {
  test('mergeServedPost garde viewerPoints ET l’instant de la dernière annonce quand le post servi ne le porte pas', () => {
    const held = post('p1', { viewerPoints: 15, viewerPointsAt: 40 });
    expect(mergeServedPost(post('p1', { content: 'corrigé' }), held)).toMatchObject({ viewerPoints: 15, viewerPointsAt: 40 });
  });

  test('…et applique la valeur servie quand il la porte, comme une lecture', () => {
    const held = post('p1', { viewerPoints: 15, viewerPointsAt: 40 });
    expect(mergeServedPost(post('p1', { viewerPoints: 9 }), held)).toMatchObject({ viewerPoints: 9, viewerPointsAt: 40 });
  });
});

describe('une LECTURE s’applique et garde l’instant de la dernière annonce (structuralSharing des caisses de cartes)', () => {
  const served = (posts: readonly FeedPost[]) => ({ ok: true as const, data: posts });

  test('le fil relu : la valeur lue s’applique ; absente, la carte garde la sienne ; une annonce plus ancienne ne défait pas la lecture', async () => {
    const responses = [
      served([post('p1', { viewerPoints: 30 }), post('p2', { viewerPoints: 0 })]),
      served([post('p1', { viewerPoints: 25 }), post('p2', { viewerPoints: 0 })]),
      served([post('p1'), post('p2', { viewerPoints: 6 })]),
    ];
    const { transport } = scripted(async () => responses.shift() ?? served([]));
    const queryClient = new QueryClient();
    const options = feedInfiniteOptions({ source: 'gateway', transport });

    await queryClient.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(pointsOf(queryClient, 'p1')).toBe(30);

    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 50, at: 100 });
    await queryClient.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(pointsOf(queryClient, 'p1')).toBe(25);
    expect(cachedOn(queryClient, FEED_QUERY_KEY, 'p1')?.viewerPointsAt).toBe(100);

    applyPostEngagement(queryClient, { postId: 'p1', viewerPoints: 50, at: 90 });
    expect(pointsOf(queryClient, 'p1')).toBe(25);

    await queryClient.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(pointsOf(queryClient, 'p1')).toBe(25);
    expect(pointsOf(queryClient, 'p2')).toBe(6);
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
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.viewerPoints).toBe(1);
  });

  test('holdViewerPoints laisse intacte une donnée qui n’est pas une caisse de cartes', () => {
    expect(holdViewerPoints(3, 5)).toBe(5);
    expect(holdViewerPoints({ a: 1 }, { a: 1 })).toEqual({ a: 1 });
  });

  test('holdViewerPoints rend la donnée PRÉCÉDENTE quand rien n’a changé — le partage structurel tient', () => {
    const previous: FeedInfiniteData = pageOf([post('p1', { viewerPoints: 4, viewerPointsAt: 7 })]);
    const next: FeedInfiniteData = pageOf([post('p1', { viewerPoints: 4 })]);
    expect(holdViewerPoints(previous, next)).toBe(previous);
  });
});
