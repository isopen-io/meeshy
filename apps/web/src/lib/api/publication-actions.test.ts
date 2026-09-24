import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { scriptedTransport } from '@/test-support/scripted-transport';

import { FEED_QUERY_KEY } from './feed';
import { deletePost, pinPost } from './publication-actions';
import { reportPost } from './reports';
import { STORY_TRAY_QUERY_KEY, type StoryTrayPost } from './stories';

/** LES GESTES DE L'AUTEUR (#7533) — ce qui PART, et ce que le fil montre. */
const feedWith = (ids: readonly string[]) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(FEED_QUERY_KEY, {
    pages: [{ posts: ids.map((id) => ({ id, type: 'POST', createdAt: '2026-09-13T11:55:00.000Z' })) }],
    pageParams: [null],
  });
  return queryClient;
};

const idsOf = (queryClient: QueryClient): readonly string[] =>
  (queryClient.getQueryData(FEED_QUERY_KEY) as { pages: { posts: { id: string }[] }[] }).pages.flatMap((p) => p.posts.map((post) => post.id));

describe('deletePost', () => {
  test('la carte quitte le fil AVANT la réponse, et la requête est un DELETE sur la publication', async () => {
    const queryClient = feedWith(['p1', 'p2']);
    const { transport, calls } = scriptedTransport({ 'DELETE /api/v1/posts/p1': { ok: true, data: null } });

    const pending = deletePost({ postId: 'p1', deps: { source: 'gateway', transport, queryClient } });
    expect(idsOf(queryClient)).toEqual(['p2']);

    expect(await pending).toBe('done');
    expect(calls().map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /api/v1/posts/p1']);
  });

  test('un refus est un échec servi, et le fil est relu', async () => {
    const queryClient = feedWith(['p1']);
    const { transport } = scriptedTransport({ 'DELETE /api/v1/posts/p1': { ok: false, status: 403, error: 'FORBIDDEN' } });

    expect(await deletePost({ postId: 'p1', deps: { source: 'gateway', transport, queryClient } })).toBe('failed');
    expect(queryClient.getQueryState(FEED_QUERY_KEY)?.isInvalidated).toBe(true);
  });
});

/**
 * **UNE STORY SE SUPPRIME PAR LE MÊME GESTE** (#6149) — `deletePost` sert le
 * listing « Mes stories » comme il sert le menu « ⋯ » d'une carte du fil :
 * même route, même optimisme, même retour en arrière. Voir le doc-comment de
 * `story-caches.ts`.
 */
describe('deletePost — une story quitte le plateau AVANT la réponse, et y revient sur refus', () => {
  const trayWith = (ids: readonly string[]) => {
    const queryClient = new QueryClient();
    const stories: readonly StoryTrayPost[] = ids.map((id) => ({ id, type: 'STORY', createdAt: '2026-09-24T10:00:00.000Z' }));
    queryClient.setQueryData(STORY_TRAY_QUERY_KEY, stories);
    return queryClient;
  };
  const trayIdsOf = (queryClient: QueryClient): readonly string[] =>
    (queryClient.getQueryData(STORY_TRAY_QUERY_KEY) as readonly StoryTrayPost[]).map((s) => s.id);

  test('la story quitte le plateau avant même la réponse réseau', async () => {
    const queryClient = trayWith(['s1', 's2']);
    const { transport } = scriptedTransport({ 'DELETE /api/v1/posts/s1': { ok: true, data: null } });

    const pending = deletePost({ postId: 's1', deps: { source: 'gateway', transport, queryClient } });
    expect(trayIdsOf(queryClient)).toEqual(['s2']);

    expect(await pending).toBe('done');
  });

  test('un refus relit le plateau des stories, comme le Flux — la story revient', async () => {
    const queryClient = trayWith(['s1']);
    const { transport } = scriptedTransport({ 'DELETE /api/v1/posts/s1': { ok: false, status: 500, error: 'INTERNAL_ERROR' } });

    expect(await deletePost({ postId: 's1', deps: { source: 'gateway', transport, queryClient } })).toBe('offline');
    expect(queryClient.getQueryState(STORY_TRAY_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  test('supprimer une carte du Flux ne touche à AUCUN corpus de stories', async () => {
    const stories: readonly StoryTrayPost[] = [{ id: 's1', type: 'STORY', createdAt: '2026-09-24T10:00:00.000Z' }];
    const queryClient = feedWith(['p1']);
    queryClient.setQueryData(STORY_TRAY_QUERY_KEY, stories);
    const { transport } = scriptedTransport({ 'DELETE /api/v1/posts/p1': { ok: true, data: null } });

    await deletePost({ postId: 'p1', deps: { source: 'gateway', transport, queryClient } });

    expect(queryClient.getQueryData(STORY_TRAY_QUERY_KEY)).toBe(stories);
  });
});

describe('pinPost', () => {
  test('un POST sur `/pin`', async () => {
    const { transport, calls } = scriptedTransport({ 'POST /api/v1/posts/p1/pin': { ok: true, data: { pinned: true } } });

    expect(await pinPost({ postId: 'p1', deps: { source: 'gateway', transport, queryClient: new QueryClient() } })).toBe('done');
    expect(calls()).toHaveLength(1);
  });
});

describe('reportPost', () => {
  test('la même route que le signalement d’un compte, `reportedType: post`', async () => {
    const { transport, calls } = scriptedTransport({ 'POST /api/v1/reports': { ok: true, data: null } });

    expect(await reportPost({ postId: 'p1', reason: 'spam', deps: { source: 'gateway', transport } })).toBe('done');
    expect(calls()[0]?.body).toEqual({ reportedType: 'post', reportedEntityId: 'p1', reportType: 'spam' });
  });
});
