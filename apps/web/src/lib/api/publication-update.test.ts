import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import { scriptedTransport } from '@/test-support/scripted-transport';

import { FEED_QUERY_KEY } from './feed';
import type { FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { postQueryKey } from './publication-detail';
import { updatePublication } from './publication-update';

/**
 * **LE PORT DE L'ENREGISTREMENT D'UNE PUBLICATION ROUVERTE** (#9317) —
 * `PUT /posts/:id` avec le document entier : OPTIMISTE sur toutes les
 * caisses qui montrent la carte, la réponse servie s'y pose, un refus rend
 * EXACTEMENT ce qui y était.
 */
const BEFORE: CanvasV3 = { v: 3, scenes: [{ id: 'page-1', objects: [] }] };
const AFTER: CanvasV3 = { v: 3, scenes: [{ id: 'page-1', objects: [] }, { id: 'page-2', objects: [] }] };

const held = (): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-10-01T10:00:00.000Z',
  content: 'Avant',
  storyEffects: BEFORE,
  translations: { en: { text: 'Before' } },
  isLikedByMe: true,
});

const cachesWith = (post: FeedPost) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(FEED_QUERY_KEY, { pages: [{ posts: [post] }], pageParams: [null] });
  queryClient.setQueryData(postQueryKey(post.id), post);
  return queryClient;
};

const feedCard = (queryClient: QueryClient): FeedPost =>
  (queryClient.getQueryData(FEED_QUERY_KEY) as { pages: { posts: FeedPost[] }[] }).pages[0]!.posts[0]!;

describe('updatePublication (#9317)', () => {
  test('un PUT sur la publication, portant le corps tel quel, sous les en-têtes du canvas', async () => {
    const queryClient = cachesWith(held());
    const { transport, calls } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: true, data: { ...held(), storyEffects: AFTER } } });
    const result = await updatePublication({ postId: 'p1', body: { storyEffects: AFTER, removeMediaIds: ['pm-2'] }, deps: { source: 'gateway', transport, queryClient } });
    expect(result.ok).toBe(true);
    const [call] = calls();
    expect(call?.method).toBe('PUT');
    expect(call?.body).toEqual({ storyEffects: AFTER, removeMediaIds: ['pm-2'] });
    expect(call?.headers).toBeDefined();
  });

  test('la carte montre le NOUVEAU document avant la réponse — un corps changé efface ses traductions', async () => {
    const queryClient = cachesWith(held());
    let release: () => void = () => undefined;
    const { transport } = scriptedTransport({});
    const held$ = (): Promise<ApiResult<unknown>> =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true, data: { ...held(), content: 'Après', storyEffects: AFTER, translations: {} } });
      });
    transport.request = held$ as HttpTransport['request'];
    const pending = updatePublication({ postId: 'p1', body: { storyEffects: AFTER, content: 'Après' }, deps: { source: 'gateway', transport, queryClient } });
    expect(feedCard(queryClient).storyEffects).toEqual(AFTER);
    expect(feedCard(queryClient).content).toBe('Après');
    expect(feedCard(queryClient).translations).toEqual({});
    expect((queryClient.getQueryData(postQueryKey('p1')) as FeedPost).storyEffects).toEqual(AFTER);
    release();
    await pending;
  });

  test('la publication SERVIE se pose sur la carte, et l’état du lecteur survit', async () => {
    const queryClient = cachesWith(held());
    const served = { ...held(), storyEffects: AFTER, isLikedByMe: false, likeCount: 4 };
    const { transport } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: true, data: served } });
    await updatePublication({ postId: 'p1', body: { storyEffects: AFTER }, deps: { source: 'gateway', transport, queryClient } });
    expect(feedCard(queryClient).likeCount).toBe(4);
    expect(feedCard(queryClient).isLikedByMe).toBe(true);
  });

  test('un refus rend à la carte son document, son corps et ses traductions d’avant', async () => {
    const queryClient = cachesWith(held());
    const { transport } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: false, status: 422, error: 'reel', code: 'INVALID_POST_UPDATE' } });
    const result = await updatePublication({ postId: 'p1', body: { storyEffects: AFTER, content: 'Après' }, deps: { source: 'gateway', transport, queryClient } });
    expect(result.ok).toBe(false);
    expect(feedCard(queryClient).storyEffects).toEqual(BEFORE);
    expect(feedCard(queryClient).content).toBe('Avant');
    expect(feedCard(queryClient).translations).toEqual({ en: { text: 'Before' } });
  });
});
